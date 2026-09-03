/**
 * Re-run the current mapper over rows we captured but never promoted, and
 * promote whatever now passes.
 *
 * Run: npm run repromote-provider-questions
 *
 * Makes no network calls to the provider — it reads the payloads we already
 * captured. This is the mechanism the staging table exists for: improving the
 * mapper must be able to rescue questions we already paid to fetch. Run it
 * after bumping MAPPER_VERSION, or after writing explanations for the cohort
 * rejected for a missing solution.
 *
 * It sweeps PENDING rows as well as REJECTED ones. A PENDING row is one whose
 * image mirror failed on our side rather than the provider's — nothing is
 * wrong with the question, and the fingerprint dedupe in the ingest path will
 * never look at it again, so this is its only route out of staging.
 */
import { Prisma } from "@prisma/client";
import { db } from "../src/lib/db";
import { uploadRemoteImage, UploadRejectedError } from "../src/lib/cloudinary";
import { mapProviderQuestion, MAPPER_VERSION } from "../src/lib/question-provider/mapper";

async function main() {
  const stale = await db.providerQuestion.findMany({
    where: {
      status: { in: ["REJECTED", "PENDING"] },
      mapperVersion: { lt: MAPPER_VERSION },
    },
    include: { fetch: { select: { subjectId: true } } },
  });

  console.log(`${stale.length} unpromoted rows below mapper version ${MAPPER_VERSION}`);

  let promoted = 0;
  let stillRejected = 0;

  for (const row of stale) {
    // Whether this row was already counted in the ledger's rejectedCount.
    // A PENDING row never was, so promoting one must not decrement it.
    const wasCounted = row.status === "REJECTED";

    const result = mapProviderQuestion(row.payload);
    const subjectId = row.fetch.subjectId;

    if (!result.ok || !subjectId) {
      await db.providerQuestion.update({
        where: { id: row.id },
        data: {
          status: "REJECTED",
          mapperVersion: MAPPER_VERSION,
          rejectionReasons: result.ok
            ? [{ field: "subjectId", message: "The fetch has no subject." }]
            : result.reasons,
        },
      });
      stillRejected += 1;
      continue;
    }

    let imageUrl: string | null = null;
    if (result.question.providerImageUrl) {
      try {
        imageUrl = await uploadRemoteImage(
          result.question.providerImageUrl,
          `sdash-${result.providerQuestionId ?? result.fingerprint.slice(0, 16)}`,
        );
      } catch (error) {
        // Same split as the ingest path: only the caller's fault is a
        // rejection. A service-side blip leaves the row PENDING so the next
        // run tries again rather than discarding a question we paid for.
        const blameCaller =
          error instanceof UploadRejectedError ? error.blameCaller : false;
        await db.providerQuestion.update({
          where: { id: row.id },
          data: {
            status: blameCaller ? "REJECTED" : "PENDING",
            mapperVersion: MAPPER_VERSION,
            rejectionReasons: [
              {
                field: "questionImageUrl",
                message: `Could not mirror the image: ${
                  error instanceof Error ? error.message : String(error)
                }`,
              },
            ],
          },
        });
        stillRejected += 1;
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
      await tx.providerQuestion.update({
        where: { id: row.id },
        data: {
          status: "PROMOTED",
          // DbNull clears the column; `undefined` would leave the stale
          // reasons in place on a row that no longer has any.
          rejectionReasons: Prisma.DbNull,
          mapperVersion: MAPPER_VERSION,
          questionId: question.id,
          promotedAt: new Date(),
        },
      });
      await tx.providerFetch.update({
        where: { id: row.fetchId },
        data: {
          promotedCount: { increment: 1 },
          ...(wasCounted ? { rejectedCount: { decrement: 1 } } : {}),
        },
      });
    });
    promoted += 1;
  }

  console.log(`Promoted ${promoted}, still unpromoted ${stillRejected}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
