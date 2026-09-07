import { Prisma, type Question } from "@prisma/client";
import { db as realDb } from "@/lib/db";
import { cacheKey } from "./cache-key";
import { mapProviderQuestion, MAPPER_VERSION } from "./mapper";
import { DRAW_LIMIT, MAX_DRAWS, isSaturated } from "./saturation";
import { getSdashAdapter } from "./sdash";
import { EXHAUSTED_COOLDOWN_MS, isCircuitOpen, nextCircuit, type CircuitRow } from "./state";
import {
  ProviderError,
  type ProviderFailureKind,
  type ProviderFilter,
  type QuestionProviderAdapter,
} from "./types";

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
        drawCount: number | { increment: number };
        newInLastDraw: number;
        rawCount: number | { increment: number };
        promotedCount: number | { increment: number };
        rejectedCount: number | { increment: number };
      }>;
    }): Promise<ProviderFetchRow>;
    updateMany(args: {
      where: { id: string; status: FetchStatus; startedAt: Date };
      data: { startedAt: Date };
    }): Promise<{ count: number }>;
  };
  providerQuestion: {
    findFirst(args: {
      where: {
        fetchId: string;
        OR: ({ providerQuestionId: string } | { fingerprint: string })[];
      };
      select: { id: true };
    }): Promise<{ id: string } | null>;
    findMany(args: {
      where: { fetchId: string };
      select: { providerQuestionId: true; fingerprint: true };
    }): Promise<{ providerQuestionId: string | null; fingerprint: string }[]>;
    createMany(args: { data: object[] }): Promise<{ count: number }>;
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
  providerState: {
    findUnique(args: {
      where: { provider: "SDASH" };
    }): Promise<(CircuitRow & { creditsRemaining: number | null }) | null>;
    upsert(args: {
      where: { provider: "SDASH" };
      create: {
        provider: "SDASH";
        state: CircuitRow["state"];
        cooldownUntil: Date | null;
        lastError?: string | null;
      };
      update: {
        state: CircuitRow["state"];
        cooldownUntil: Date | null;
        lastError?: string | null;
      };
    }): Promise<unknown>;
    /**
     * A guarded write, in the same spirit as `providerFetch.updateMany`: it
     * lands only if the row still matches every field named in `where`, so
     * of several callers racing to act on the same snapshot exactly one
     * succeeds.
     */
    updateMany(args: {
      where: { provider: "SDASH" } & Partial<Pick<CircuitRow, "state" | "cooldownUntil">>;
      data: Partial<Pick<CircuitRow, "state" | "cooldownUntil">>;
    }): Promise<{ count: number }>;
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
  /** Injected so cooldown arithmetic is testable without waiting. */
  now: () => number;
};

const defaultDeps: IngestDeps = {
  db: realDb as unknown as IngestDb,
  getAdapter: getSdashAdapter,
  now: () => Date.now(),
};

/**
 * Takes the lease for exactly one draw, atomically.
 *
 * `startedAt` doubles as an optimistic-concurrency token: the write lands only
 * if nobody has touched the row since we read it, so of N racing callers
 * exactly one proceeds and the rest fall out. Winning also *renews* the lease,
 * which is what stops a long saturation run from going stale underneath itself
 * and inviting a second drawer in halfway through.
 */
async function claimDraw(
  db: IngestDb,
  id: string,
  seenStartedAt: Date,
): Promise<boolean> {
  const { count } = await db.providerFetch.updateMany({
    where: { id, status: "PENDING", startedAt: seenStartedAt },
    data: { startedAt: new Date() },
  });
  return count === 1;
}

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
  } else if (!(await claimDraw(db, ledger.id, ledger.startedAt))) {
    // Stale PENDING row (the previous draw crashed or timed out), but someone
    // else reclaimed it in the moment between our read and our claim. Theirs
    // is now the live lease; read what we have rather than drawing alongside.
    return {
      questions: await readFromDb(db, subject.id, filter, limit),
      source: "db" as const,
      ledger: {
        status: ledger.status,
        rawCount: ledger.rawCount,
        promotedCount: ledger.promotedCount,
      },
    };
  }

  if (await circuitIsOpen(deps)) {
    return {
      questions: await readFromDb(db, subject.id, filter, limit),
      source: "db" as const,
      ledger: {
        status: ledger.status,
        rawCount: ledger.rawCount,
        promotedCount: ledger.promotedCount,
      },
    };
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
    // Every request that finds a filter unfinished schedules one of these, so
    // several loops can be pointed at the same paper at once. The claim is
    // what keeps exactly one of them drawing: the losers exit here, having
    // cost a single read apiece. Without it they all draw in parallel —
    // duplicate provider spend, and unique-constraint collisions that abandon
    // the rest of a draw's payloads.
    if (await circuitIsOpen(deps)) return;
    if (!(await claimDraw(db, ledger.id, ledger.startedAt))) return;
    await drawOnce(ledger.id, subject.id, filter, deps);
  }
}

/**
 * True when we must not spend a request on this provider right now.
 *
 * An `EXHAUSTED` row whose cooldown has just lapsed is the one probe the
 * breaker owes the provider — but "the cooldown lapsed" is only a read, and
 * every filter's caller (of ~950 in flight) can observe it before any of
 * them writes back. Left alone that is N probes against an unfunded
 * provider, not one. So the lapse itself is claimed with a guarded write,
 * mirroring `claimDraw`'s optimistic lock: it lands only for the caller who
 * still sees the exact row we just read, and re-arms the cooldown so the
 * rest see it as still open and skip. A row that is `OK`, or `EXHAUSTED`
 * with a live cooldown, or `BLOCKED` needs no claim — there is no probe to
 * hand out.
 */
async function circuitIsOpen(deps: IngestDeps): Promise<boolean> {
  const row = await deps.db.providerState.findUnique({ where: { provider: PROVIDER } });
  const now = deps.now();
  if (isCircuitOpen(row, now)) return true;

  if (row && row.state === "EXHAUSTED") {
    const { count } = await deps.db.providerState.updateMany({
      where: { provider: PROVIDER, cooldownUntil: row.cooldownUntil },
      data: { cooldownUntil: new Date(now + EXHAUSTED_COOLDOWN_MS) },
    });
    // count 0 means another caller already claimed the lapse a moment ago;
    // their probe is the live one, so we must not draw either.
    return count === 0;
  }

  return false;
}

async function recordCircuit(
  deps: IngestDeps,
  kind: ProviderFailureKind | "ok",
  message: string | null,
  guard?: (CircuitRow & { creditsRemaining: number | null }) | null,
) {
  if (kind === "ok") {
    // A late success must not clobber a breaker some other caller armed
    // after this draw started — guard the write on the exact row `drawOnce`
    // saw before calling the adapter, the same optimistic-lock idiom as the
    // claim above. No prior row means there was nothing to close.
    if (!guard) return;
    await deps.db.providerState.updateMany({
      where: { provider: PROVIDER, state: guard.state, cooldownUntil: guard.cooldownUntil },
      data: { state: "OK", cooldownUntil: null },
    });
    return;
  }

  const next = nextCircuit(kind, deps.now());
  // Retryable failures leave the breaker untouched.
  if (!next) return;

  await deps.db.providerState.upsert({
    where: { provider: PROVIDER },
    create: { provider: PROVIDER, ...next, lastError: message },
    update: { ...next, lastError: message },
  });
}

/** One draw: fetch, stage, promote, then update the ledger. */
async function drawOnce(
  fetchId: string,
  subjectId: string,
  filter: ProviderFilter,
  deps: IngestDeps,
) {
  const { db } = deps;

  // Snapshotted before the call so a success below can be guarded against a
  // breaker armed by someone else while this draw was in flight.
  const circuitBeforeDraw = await db.providerState.findUnique({ where: { provider: PROVIDER } });

  let payloads: unknown[];
  try {
    // Inside the try: getAdapter() throws terminally when the access token is
    // unset, and outside it that escaped all the way to the route's catch-all,
    // 500ing every past-paper quiz instead of marking the filter FAILED and
    // falling back to a database-only one.
    payloads = await deps.getAdapter().draw(filter, DRAW_LIMIT);
  } catch (error) {
    const kind = error instanceof ProviderError ? error.kind : "retryable";
    const message = error instanceof Error ? error.message : String(error);
    await recordCircuit(deps, kind, message);
    await db.providerFetch.update({
      where: { id: fetchId },
      data: {
        // Only a genuinely permanent cause is final. An empty wallet leaves
        // the filter PENDING so that topping up is all the recovery needed.
        status: kind === "terminal" ? "FAILED" : "PENDING",
        error: message,
        completedAt: kind === "terminal" ? new Date() : null,
      },
    });
    return;
  }

  // A draw that returned is proof the provider is answering again.
  await recordCircuit(deps, "ok", null, circuitBeforeDraw);

  let newCount = 0;
  let promoted = 0;
  let rejected = 0;
  let loopError: unknown = null;
  const staged: object[] = [];

  try {
    // One read for the whole draw. Dedupe then happens in memory against this
    // set rather than costing a round trip per payload — the difference
    // between ~200 sequential queries and one, against a five-connection
    // pool that background ingest shares with live traffic.
    const existing = await db.providerQuestion.findMany({
      where: { fetchId },
      select: { providerQuestionId: true, fingerprint: true },
    });
    const seenIds = new Set(
      existing.map((row) => row.providerQuestionId).filter((id): id is string => id !== null),
    );
    const seenFingerprints = new Set(existing.map((row) => row.fingerprint));

    for (const payload of payloads) {
      const result = mapProviderQuestion(payload, {
        examType: filter.examType,
        examYear: filter.examYear,
      });

      // Dedupe on their id first, then on the content fingerprint — but only
      // within this fetch. A draw redraws the same pool repeatedly, so we must
      // skip what this filter already holds; we must NOT skip a question
      // another paper happens to share, or the second paper to contain a
      // recycled question would silently go without it.
      if (
        (result.providerQuestionId && seenIds.has(result.providerQuestionId)) ||
        seenFingerprints.has(result.fingerprint)
      ) {
        continue;
      }
      // Claim it now, so a payload repeated inside this same draw is caught.
      if (result.providerQuestionId) seenIds.add(result.providerQuestionId);
      seenFingerprints.add(result.fingerprint);

      if (!result.ok) {
        staged.push({
          fetchId,
          provider: PROVIDER,
          providerQuestionId: result.providerQuestionId,
          fingerprint: result.fingerprint,
          payload: payload as object,
          status: "REJECTED",
          rejectionReasons: result.reasons,
          mapperVersion: MAPPER_VERSION,
        });
        newCount += 1;
        rejected += 1;
        continue;
      }

      // Questions carrying a provider image are staged, not promoted.
      //
      // Mirroring is a download plus an upload — the slowest thing in ingest,
      // and unbounded in the tail. Running it here made every image add
      // seconds to the draw and let one Cloudinary hiccup abandon the rest of
      // the payloads. The mirror pass promotes these later from the stored
      // payload, at no further cost to the provider.
      if (result.question.providerImageUrl) {
        staged.push({
          fetchId,
          provider: PROVIDER,
          providerQuestionId: result.providerQuestionId,
          fingerprint: result.fingerprint,
          payload: payload as object,
          status: "PENDING",
          rejectionReasons: [
            {
              field: "questionImageUrl",
              message: "Awaiting the image mirror pass.",
            },
          ],
          mapperVersion: MAPPER_VERSION,
        });
        newCount += 1;
        // Neither promoted nor rejected: it is pending work, not a failure.
        continue;
      }

      await db.$transaction(async (tx) => {
        const question = await tx.question.create({
          data: {
            subjectId,
            examType: result.question.examType,
            examYear: result.question.examYear,
            questionText: result.question.questionText,
            questionImageUrl: null,
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

  if (staged.length > 0) {
    await db.providerQuestion.createMany({ data: staged });
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
      // Incremented rather than written back, so a stray concurrent draw can
      // never rewind the count and hand the filter unlimited draws.
      drawCount: { increment: 1 },
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
 * Puts a `FAILED` filter back in play.
 *
 * `FAILED` is otherwise final — both `ensureQuestionsCached` and `saturate`
 * return on sight of it — which is right for a genuinely terminal cause but
 * wrong for a transient one that merely looked terminal: a 403 while a plan
 * lapsed, a token rotated mid-flight. Without this the only remedy is hand-
 * written SQL, and one bad deploy window can blackhole a large set of papers.
 *
 * Counters and staged rows are deliberately preserved; only the status, the
 * error and the lease are cleared. `drawCount` in particular carries over, so
 * a filter that failed on its ninth draw does not get twelve fresh ones.
 *
 * Returns false when there was no such row, or it was not `FAILED` — resetting
 * a live or saturated filter is never what the caller meant.
 */
export async function resetFailedFetch(
  filter: ProviderFilter,
  deps: IngestDeps = defaultDeps,
): Promise<boolean> {
  const { db } = deps;
  const row = await db.providerFetch.findUnique({
    where: { provider_cacheKey: { provider: PROVIDER, cacheKey: cacheKey(filter) } },
  });
  if (!row || row.status !== "FAILED") return false;

  await db.providerFetch.update({
    where: { id: row.id },
    data: {
      status: "PENDING",
      error: null,
      completedAt: null,
      // Backdated past the lease window so the next caller draws immediately
      // instead of mistaking the reset for an in-flight claim.
      startedAt: new Date(Date.now() - LEASE_WINDOW_MS),
    },
  });
  return true;
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
