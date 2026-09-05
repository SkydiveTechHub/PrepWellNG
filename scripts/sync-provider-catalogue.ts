/**
 * One-off sweep populating ProviderCatalogue.
 *
 * Run: npm run sync-provider-catalogue
 *
 * ~24 mapped subjects x 26 years x 3 exam types is roughly 1,800 requests at
 * one per 400ms — about 20 minutes. Safe to re-run; it is idempotent, and
 * worth repeating annually as new years appear.
 */
import { db } from "../src/lib/db";
import { getSdashAdapter } from "../src/lib/question-provider/sdash";
import {
  PROVIDER_EXAM_SLUGS,
  toExamType,
  toProviderSubjectSlug,
} from "../src/lib/question-provider/alias";
import { ProviderError } from "../src/lib/question-provider/types";

const SPACING_MS = 400;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const adapter = getSdashAdapter();

  // Fail loudly if a slug we map has vanished from their catalogue — silently
  // skipping a subject would look identical to that subject having no papers.
  const theirSubjects = new Set((await adapter.listSubjects()).map((s) => s.slug));
  const years = await adapter.listYears();
  const ourSubjects = await db.subject.findMany({ select: { id: true, slug: true, name: true } });

  const mapped = ourSubjects.flatMap((subject) => {
    const providerSlug = toProviderSubjectSlug(subject.slug);
    if (!providerSlug) return [];
    if (!theirSubjects.has(providerSlug)) {
      throw new Error(
        `Alias maps "${subject.slug}" to "${providerSlug}", which is no longer in /v1/subjects. Update alias.ts.`,
      );
    }
    return [{ ...subject, providerSlug }];
  });

  console.log(
    `Sweeping ${mapped.length} subjects x ${years.length} years x ${PROVIDER_EXAM_SLUGS.length} exams ` +
      `= ${mapped.length * years.length * PROVIDER_EXAM_SLUGS.length} requests`,
  );

  let found = 0;
  let empty = 0;

  for (const subject of mapped) {
    for (const examSlug of PROVIDER_EXAM_SLUGS) {
      const examType = toExamType(examSlug)!;
      for (const year of years) {
        try {
          const rows = await adapter.draw(
            { subjectSlug: subject.slug, examType, examYear: year },
            1,
          );
          if (rows.length > 0) {
            await db.providerCatalogue.upsert({
              where: {
                provider_subjectId_examType_examYear: {
                  provider: "SDASH",
                  subjectId: subject.id,
                  examType,
                  examYear: year,
                },
              },
              create: { provider: "SDASH", subjectId: subject.id, examType, examYear: year },
              update: {},
            });
            found += 1;
          } else {
            empty += 1; // a 404 — definitively nothing here, not a failure
          }
        } catch (error) {
          if (error instanceof ProviderError && error.kind === "terminal") {
            console.error(`Terminal error, stopping: ${error.message}`);
            process.exit(1);
          }
          console.warn(`Retryable error on ${subject.slug}/${examSlug}/${year}, skipping`);
        }
        await sleep(SPACING_MS);
      }
    }
    console.log(`  ${subject.name}: ${found} found so far`);
  }

  console.log(`\nDone. ${found} papers recorded, ${empty} combinations empty.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
