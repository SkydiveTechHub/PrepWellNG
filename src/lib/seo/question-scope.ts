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
