import { Prisma, type Question } from "@prisma/client";
import { db as realDb } from "@/lib/db";
import { uploadRemoteImage, UploadRejectedError } from "@/lib/cloudinary";
import { cacheKey } from "./cache-key";
import { mapProviderQuestion, MAPPER_VERSION } from "./mapper";
import { DRAW_LIMIT, MAX_DRAWS, isSaturated } from "./saturation";
import { getSdashAdapter } from "./sdash";
import { ProviderError, type ProviderFilter, type QuestionProviderAdapter } from "./types";

const PROVIDER = "SDASH" as const;

/**
 * How long a `PENDING` row's `startedAt` is trusted as a live claim.
 *
 * `startedAt` doubles as a lease: the unique constraint on
 * `(provider, cacheKey)` only serialises the *insert* instant, not the
 * seconds a draw spends waiting on the provider. A second request that finds
 * a `PENDING` row inside this window reads the database instead of drawing
 * again; one that finds it stale (the previous draw crashed, or the process
 * died) reclaims it by refreshing `startedAt` and draws itself.
 */
export const LEASE_WINDOW_MS = 120_000;

type FetchStatus = "PENDING" | "SATURATED" | "FAILED";

/** Shape of a `ProviderFetch` row, as read/written by this module. */
type ProviderFetchRow = {
  id: string;
  status: FetchStatus;
  rawCount: number;
  promotedCount: number;
  rejectedCount: number;
  drawCount: number;
  newInLastDraw: number;
  startedAt: Date;
  completedAt: Date | null;
  error: string | null;
};

/**
 * The narrow slice of `db` this module touches, expressed as its own
 * interface so tests can supply an in-memory fake without mocking the whole
 * Prisma client. The real client (`src/lib/db`) satisfies this structurally;
 * it is handed in via a cast rather than fought into exact structural
 * equality with Prisma's generic, overloaded delegate types.
 */
export type IngestDb = {
  subject: {
    findUnique(args: {
      where: { slug: string };
      select: { id: true };
    }): Promise<{ id: string } | null>;
  };
  providerFetch: {
    findUnique(args: {
      where:
        | { id: string }
        | { provider_cacheKey: { provider: "SDASH"; cacheKey: string } };
    }): Promise<ProviderFetchRow | null>;
    create(args: {
      data: {
        provider: "SDASH";
        cacheKey: string;
        subjectId: string;
        examType: string;
        examYear: number;
      };
    }): Promise<ProviderFetchRow>;
    update(args: {
      where: { id: string };
      data: Partial<{
        status: FetchStatus;
        error: string | null;
        completedAt: Date | null;
        startedAt: Date;
        drawCount: number;
        newInLastDraw: number;
        rawCount: number | { increment: number };
        promotedCount: number | { increment: number };
        rejectedCount: number | { increment: number };
      }>;
    }): Promise<ProviderFetchRow>;
  };
  providerQuestion: {
    findFirst(args: {
      where: {
        fetchId: string;
        OR: ({ providerQuestionId: string } | { fingerprint: string })[];
      };
      select: { id: true };
    }): Promise<{ id: string } | null>;
    create(args: {
      data: {
        fetchId: string;
        provider: "SDASH";
        providerQuestionId: string | null;
        fingerprint: string;
        payload: object;
        status: "PENDING" | "PROMOTED" | "REJECTED";
        rejectionReasons?: unknown;
        mapperVersion: number;
        questionId?: string;
        promotedAt?: Date;
      };
    }): Promise<unknown>;
  };
  question: {
    findMany(args: {
      where: {
        subjectId: string;
        examType: string;
        examYear: number;
        questionType: "OBJECTIVE";
      };
      take: number;
    }): Promise<Question[]>;
  };
  $transaction<T>(fn: (tx: TxDb) => Promise<T>): Promise<T>;
};

type TxDb = {
  question: {
    create(args: {
      data: {
        subjectId: string;
        examType: string;
        examYear: number;
        questionText: string;
        questionImageUrl: string | null;
        questionType: "OBJECTIVE";
        options: Record<string, string>;
        correctAnswer: string;
        explanation: string;
      };
    }): Promise<Question>;
  };
  providerQuestion: IngestDb["providerQuestion"];
};

function isUniqueConstraintViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
  );
}

export type IngestDeps = {
  db: IngestDb;
  getAdapter: () => QuestionProviderAdapter;
};

const defaultDeps: IngestDeps = {
  db: realDb as unknown as IngestDb,
  getAdapter: getSdashAdapter,
};

/** Reads from our own bank, calling the provider only the first time we see a filter. */
export async function ensureQuestionsCached(
  filter: ProviderFilter,
  limit: number,
  deps: IngestDeps = defaultDeps,
) {
  const { db } = deps;
  const key = cacheKey(filter);
  const subject = await db.subject.findUnique({
    where: { slug: filter.subjectSlug },
    select: { id: true },
  });
  if (!subject) {
    return {
      questions: [] as Question[],
      source: "db" as const,
      ledger: { status: "FAILED" as const, rawCount: 0, promotedCount: 0 },
    };
  }

  const existing = await db.providerFetch.findUnique({
    where: { provider_cacheKey: { provider: PROVIDER, cacheKey: key } },
  });

  // SATURATED and FAILED are both final for this filter: a saturated one has
  // nothing left to draw, and a failed one already proved terminal (a bad
  // credential, an unentitled subject) that redrawing cannot fix. Only
  // PENDING is worth acting on further.
  if (existing && existing.status !== "PENDING") {
    return {
      questions: await readFromDb(db, subject.id, filter, limit),
      source: "db" as const,
      ledger: {
        status: existing.status,
        rawCount: existing.rawCount,
        promotedCount: existing.promotedCount,
      },
    };
  }

  // A live PENDING row is someone else's in-flight draw, not ours to repeat.
  if (existing && Date.now() - existing.startedAt.getTime() < LEASE_WINDOW_MS) {
    return {
      questions: await readFromDb(db, subject.id, filter, limit),
      source: "db" as const,
      ledger: {
        status: existing.status,
        rawCount: existing.rawCount,
        promotedCount: existing.promotedCount,
      },
    };
  }

  // Claim the fetch. The unique constraint is the in-flight lock for the
  // create; a concurrent second request that loses that race falls back to
  // reading whatever the winner has written so far, rather than fabricating
  // zeroed counters.
  let ledger = existing;
  if (!ledger) {
    try {
      ledger = await db.providerFetch.create({
        data: {
          provider: PROVIDER,
          cacheKey: key,
          subjectId: subject.id,
          examType: filter.examType,
          examYear: filter.examYear,
        },
      });
    } catch (error) {
      if (!isUniqueConstraintViolation(error)) throw error;
      const winner = await db.providerFetch.findUnique({
        where: { provider_cacheKey: { provider: PROVIDER, cacheKey: key } },
      });
      return {
        questions: await readFromDb(db, subject.id, filter, limit),
        source: "db" as const,
        ledger: {
          status: winner?.status ?? "PENDING",
          rawCount: winner?.rawCount ?? 0,
          promotedCount: winner?.promotedCount ?? 0,
        },
      };
    }
  } else {
    // Stale PENDING row (the previous draw crashed or timed out): reclaim the
    // lease before drawing so a concurrent reader sees it as live again.
    await db.providerFetch.update({
      where: { id: ledger.id },
      data: { startedAt: new Date() },
    });
  }

  await drawOnce(ledger.id, subject.id, filter, deps);

  const after = await db.providerFetch.findUnique({ where: { id: ledger.id } });
  return {
    questions: await readFromDb(db, subject.id, filter, limit),
    source: "provider" as const,
    ledger: {
      status: after?.status ?? "PENDING",
      rawCount: after?.rawCount ?? 0,
      promotedCount: after?.promotedCount ?? 0,
    },
  };
}

/** The remaining draws, run off the response path via `after()`. */
export async function saturate(
  filter: ProviderFilter,
  deps: IngestDeps = defaultDeps,
): Promise<void> {
  const { db } = deps;
  const key = cacheKey(filter);
  const subject = await db.subject.findUnique({
    where: { slug: filter.subjectSlug },
    select: { id: true },
  });
  if (!subject) return;

  for (let i = 0; i < MAX_DRAWS; i++) {
    const ledger = await db.providerFetch.findUnique({
      where: { provider_cacheKey: { provider: PROVIDER, cacheKey: key } },
    });
    if (!ledger || ledger.status !== "PENDING") return;
    await drawOnce(ledger.id, subject.id, filter, deps);
  }
}

/** One draw: fetch, stage, promote, then update the ledger. */
async function drawOnce(
  fetchId: string,
  subjectId: string,
  filter: ProviderFilter,
  deps: IngestDeps,
) {
  const { db } = deps;
  const adapter = deps.getAdapter();

  let payloads: unknown[];
  try {
    payloads = await adapter.draw(filter, DRAW_LIMIT);
  } catch (error) {
    const kind = error instanceof ProviderError ? error.kind : "retryable";
    await db.providerFetch.update({
      where: { id: fetchId },
      data: {
        // Terminal failures are final; retryable ones stay PENDING so a later
        // request can try again.
        status: kind === "terminal" ? "FAILED" : "PENDING",
        error: error instanceof Error ? error.message : String(error),
        completedAt: kind === "terminal" ? new Date() : null,
      },
    });
    return;
  }

  let newCount = 0;
  let promoted = 0;
  let rejected = 0;
  let loopError: unknown = null;

  try {
    for (const payload of payloads) {
      const result = mapProviderQuestion(payload);

      // Dedupe on their id first, then on the content fingerprint — but only
      // within this fetch. A draw redraws the same pool repeatedly, so we must
      // skip what this filter already holds; we must NOT skip a question
      // another paper happens to share, or the second paper to contain a
      // recycled question would silently go without it.
      const seen = await db.providerQuestion.findFirst({
        where: {
          fetchId,
          OR: [
            ...(result.providerQuestionId
              ? [{ providerQuestionId: result.providerQuestionId }]
              : []),
            { fingerprint: result.fingerprint },
          ],
        },
        select: { id: true },
      });
      if (seen) continue;

      if (!result.ok) {
        await db.providerQuestion.create({
          data: {
            fetchId,
            provider: PROVIDER,
            providerQuestionId: result.providerQuestionId,
            fingerprint: result.fingerprint,
            payload: payload as object,
            status: "REJECTED",
            rejectionReasons: result.reasons,
            mapperVersion: MAPPER_VERSION,
          },
        });
        newCount += 1;
        rejected += 1;
        continue;
      }

      // Mirror the image before promoting. A question pointing at a third
      // party's asset is not one we own, so a mirror failure never promotes
      // a broken dependency; the raw payload is kept either way.
      //
      // Whether it is staged as REJECTED or left PENDING for a retry depends
      // on who was at fault: `UploadRejectedError.blameCaller` is true only
      // when Cloudinary rejected the image itself (corrupt, unacceptable) —
      // that will never succeed on retry. Anything else (a timeout, a 5xx, a
      // network blip) is our/their infrastructure having a bad moment, and
      // punishing the question for it would cost it until the next
      // MAPPER_VERSION sweep for no reason.
      let imageUrl: string | null = null;
      if (result.question.providerImageUrl) {
        try {
          imageUrl = await uploadRemoteImage(
            result.question.providerImageUrl,
            `${PROVIDER.toLowerCase()}-${result.providerQuestionId ?? result.fingerprint.slice(0, 16)}`,
          );
        } catch (error) {
          const blameCaller =
            error instanceof UploadRejectedError ? error.blameCaller : false;
          await db.providerQuestion.create({
            data: {
              fetchId,
              provider: PROVIDER,
              providerQuestionId: result.providerQuestionId,
              fingerprint: result.fingerprint,
              payload: payload as object,
              status: blameCaller ? "REJECTED" : "PENDING",
              rejectionReasons: [
                {
                  field: "questionImageUrl",
                  message: `Could not mirror the image: ${error instanceof Error ? error.message : String(error)}`,
                },
              ],
              mapperVersion: MAPPER_VERSION,
            },
          });
          newCount += 1;
          // A service-side failure is staged for retry, not counted as
          // promoted or rejected — it is neither yet.
          if (blameCaller) rejected += 1;
          continue;
        }
      }

      await db.$transaction(async (tx) => {
        const question = await tx.question.create({
          data: {
            subjectId,
            examType: result.question.examType,
            examYear: result.question.examYear,
            questionText: result.question.questionText,
            questionImageUrl: imageUrl,
            questionType: "OBJECTIVE",
            options: result.question.options,
            correctAnswer: result.question.correctAnswer,
            explanation: result.question.explanation,
          },
        });
        await tx.providerQuestion.create({
          data: {
            fetchId,
            provider: PROVIDER,
            providerQuestionId: result.providerQuestionId,
            fingerprint: result.fingerprint,
            payload: payload as object,
            status: "PROMOTED",
            mapperVersion: MAPPER_VERSION,
            questionId: question.id,
            promotedAt: new Date(),
          },
        });
      });
      newCount += 1;
      promoted += 1;
    }
  } catch (error) {
    // Whatever committed before the throw stays committed (each row and each
    // promotion is its own statement/transaction); what we must not do is
    // lose track of it. The counters below only reflect what actually ran
    // above, and the ledger write always happens — this function never lets
    // a mid-draw failure escape past it.
    loopError = error;
  }

  const current = await db.providerFetch.findUnique({ where: { id: fetchId } });
  const drawCount = (current?.drawCount ?? 0) + 1;
  const saturated =
    !loopError &&
    isSaturated({
      drawCount,
      returnedCount: payloads.length,
      newInLastDraw: newCount,
    });

  await db.providerFetch.update({
    where: { id: fetchId },
    data: {
      drawCount,
      newInLastDraw: newCount,
      rawCount: { increment: newCount },
      promotedCount: { increment: promoted },
      rejectedCount: { increment: rejected },
      // A mid-loop failure leaves the filter retryable, not saturated — we
      // do not know whether the rest of the pool holds anything new.
      status: saturated ? "SATURATED" : "PENDING",
      completedAt: saturated ? new Date() : null,
      error: loopError
        ? loopError instanceof Error
          ? loopError.message
          : String(loopError)
        : undefined,
    },
  });
}

async function readFromDb(
  db: IngestDb,
  subjectId: string,
  filter: ProviderFilter,
  limit: number,
): Promise<Question[]> {
  return db.question.findMany({
    where: {
      subjectId,
      examType: filter.examType,
      examYear: filter.examYear,
      questionType: "OBJECTIVE",
    },
    take: limit,
  });
}

/**
 * Reads a filter's ledger row without touching the provider.
 *
 * Exists so callers in `src/app` never reach for `db` themselves — the route
 * layer is not allowed to query directly. Returns `null` when the filter has
 * never been fetched.
 */
export async function readLedger(
  filter: ProviderFilter,
  deps: IngestDeps = defaultDeps,
): Promise<Pick<
  ProviderFetchRow,
  "status" | "rawCount" | "promotedCount" | "rejectedCount"
> | null> {
  const row = await deps.db.providerFetch.findUnique({
    where: { provider_cacheKey: { provider: PROVIDER, cacheKey: cacheKey(filter) } },
  });
  if (!row) return null;
  return {
    status: row.status,
    rawCount: row.rawCount,
    promotedCount: row.promotedCount,
    rejectedCount: row.rejectedCount,
  };
}
