import type { Question } from "@prisma/client";
import { db } from "@/lib/db";
import { uploadRemoteImage } from "@/lib/cloudinary";
import { cacheKey } from "./cache-key";
import { mapProviderQuestion, MAPPER_VERSION } from "./mapper";
import { DRAW_LIMIT, MAX_DRAWS, isSaturated } from "./saturation";
import { getSdashAdapter } from "./sdash";
import { ProviderError, type ProviderFilter } from "./types";

const PROVIDER = "SDASH" as const;

/** Reads from our own bank, calling the provider only the first time we see a filter. */
export async function ensureQuestionsCached(
  filter: ProviderFilter,
  limit: number,
) {
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

  // Already saturated: our copy is authoritative, and this branch is dead for
  // this filter from now on.
  if (existing?.status === "SATURATED") {
    return {
      questions: await readFromDb(subject.id, filter, limit),
      source: "db" as const,
      ledger: {
        status: existing.status,
        rawCount: existing.rawCount,
        promotedCount: existing.promotedCount,
      },
    };
  }

  // Claim the fetch. The unique constraint is the in-flight lock: a concurrent
  // second request loses the race here and reads what the winner wrote.
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
    } catch {
      // Lost the race — fall back to serving from the database.
      return {
        questions: await readFromDb(subject.id, filter, limit),
        source: "db" as const,
        ledger: { status: "PENDING" as const, rawCount: 0, promotedCount: 0 },
      };
    }
  }

  await drawOnce(ledger.id, subject.id, filter);

  const after = await db.providerFetch.findUnique({ where: { id: ledger.id } });
  return {
    questions: await readFromDb(subject.id, filter, limit),
    source: "provider" as const,
    ledger: {
      status: after?.status ?? "PENDING",
      rawCount: after?.rawCount ?? 0,
      promotedCount: after?.promotedCount ?? 0,
    },
  };
}

/** The remaining draws, run off the response path via `after()`. */
export async function saturate(filter: ProviderFilter): Promise<void> {
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
    await drawOnce(ledger.id, subject.id, filter);
  }
}

/** One draw: fetch, stage, promote, then update the ledger. */
async function drawOnce(fetchId: string, subjectId: string, filter: ProviderFilter) {
  const adapter = getSdashAdapter();

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

  for (const payload of payloads) {
    const result = mapProviderQuestion(payload);

    // Dedupe on their id first, then on the content fingerprint.
    const seen = await db.providerQuestion.findFirst({
      where: {
        provider: PROVIDER,
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

    newCount += 1;

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
      rejected += 1;
      continue;
    }

    // Mirror the image before promoting. A question pointing at a third
    // party's asset is not one we own, so a mirror failure rejects the row
    // rather than promoting a broken dependency; the raw payload is kept and
    // retried on the next MAPPER_VERSION sweep.
    let imageUrl: string | null = null;
    if (result.question.providerImageUrl) {
      try {
        imageUrl = await uploadRemoteImage(
          result.question.providerImageUrl,
          `${PROVIDER.toLowerCase()}-${result.providerQuestionId ?? result.fingerprint.slice(0, 16)}`,
        );
      } catch (error) {
        await db.providerQuestion.create({
          data: {
            fetchId,
            provider: PROVIDER,
            providerQuestionId: result.providerQuestionId,
            fingerprint: result.fingerprint,
            payload: payload as object,
            status: "REJECTED",
            rejectionReasons: [
              {
                field: "questionImageUrl",
                message: `Could not mirror the image: ${error instanceof Error ? error.message : String(error)}`,
              },
            ],
            mapperVersion: MAPPER_VERSION,
          },
        });
        rejected += 1;
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
    promoted += 1;
  }

  const current = await db.providerFetch.findUnique({ where: { id: fetchId } });
  const drawCount = (current?.drawCount ?? 0) + 1;
  const saturated = isSaturated({
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
      status: saturated ? "SATURATED" : "PENDING",
      completedAt: saturated ? new Date() : null,
    },
  });
}

async function readFromDb(
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
