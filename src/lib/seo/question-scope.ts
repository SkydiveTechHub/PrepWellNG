import type { Prisma } from "@prisma/client";

/**
 * The only question filter a public page may use.
 *
 * `providerQuestion: { is: null }` excludes anything ingested from a provider
 * (currently SDASH): that content is licensed for use inside the product, and
 * putting it on an indexable page is republication.
 *
 * The public constraints are spread last so a caller's `extra` can narrow the
 * query but never widen it past the two rules above.
 */
export function publicQuestionWhere(
  extra: Prisma.QuestionWhereInput = {},
): Prisma.QuestionWhereInput {
  return {
    ...extra,
    providerQuestion: { is: null },
    questionType: "OBJECTIVE",
  };
}

/**
 * Options is a Json column; a row with no parsed options cannot be rendered
 * as a sample, so it must not count toward eligibility either. This is the
 * one place that rule lives — learn-data.ts's loadPublicTopic/
 * loadEligibleTopics and paper-data.ts's loadPaper/loadEligiblePaperParams
 * all call it, so the prerendered/sitemapped set and the non-404 set can
 * never drift apart.
 */
export function keepRenderable<T extends { options: unknown }>(
  questions: T[],
): (T & { options: Record<string, string> })[] {
  return questions.flatMap((q) => {
    const options = q.options as Record<string, string> | null;
    if (!options || Object.keys(options).length === 0) return [];
    return [{ ...q, options }];
  });
}
