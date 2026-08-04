// Invariants the schema cannot express.
//
// `Question.correctAnswer` is a bare String and `Question.options` a nullable
// Json blob (prisma/schema.prisma:417-418), so nothing stops an objective
// question from declaring a correct answer that is not one of its options —
// which marks every student wrong, silently. Likewise `topicId` is only
// constrained to *a* topic, not to a topic under the question's subject.

export type QuestionOptions = Record<string, string>;

export type InvariantIssue = { field: string; message: string };

export const MIN_OBJECTIVE_OPTIONS = 4;

/** Upper-cases keys, trims values, and reports keys that collide once cased. */
export function normalizeOptions(
  options: QuestionOptions | null | undefined,
): { options: QuestionOptions | null; issues: InvariantIssue[] } {
  if (!options) return { options: null, issues: [] };

  const normalized: QuestionOptions = {};
  const seen = new Set<string>();
  const duplicates: string[] = [];

  for (const [rawKey, rawValue] of Object.entries(options)) {
    const key = rawKey.trim().toUpperCase();
    if (seen.has(key)) {
      duplicates.push(key);
      continue;
    }
    seen.add(key);
    normalized[key] = String(rawValue).trim();
  }

  const issues: InvariantIssue[] = [];
  if (duplicates.length > 0) {
    issues.push({
      field: "options",
      message: `Duplicate option keys: ${[...new Set(duplicates)].join(", ")}`,
    });
  }

  return { options: normalized, issues };
}

export function checkQuestionInvariants(input: {
  questionType: "OBJECTIVE" | "THEORY" | "FILL_IN_BLANK";
  options?: QuestionOptions | null;
  correctAnswer: string;
}): InvariantIssue[] {
  const { options, issues } = normalizeOptions(input.options);

  // Only objective questions are auto-marked against an option key.
  if (input.questionType !== "OBJECTIVE") return issues;

  const keys = options ? Object.keys(options) : [];

  if (keys.length < MIN_OBJECTIVE_OPTIONS) {
    issues.push({
      field: "options",
      message: `An objective question needs at least ${MIN_OBJECTIVE_OPTIONS} options.`,
    });
    return issues;
  }

  const answer = input.correctAnswer.trim().toUpperCase();
  if (!keys.includes(answer)) {
    issues.push({
      field: "correctAnswer",
      message: `The correct answer must be one of the option keys (${keys.join(", ")}).`,
    });
  }

  return issues;
}

/**
 * `topicSubjectId` is the subject of the resolved topic, or null when the
 * reference did not resolve at all. `topicRef` is whatever the caller was
 * given — an id from the form, a slug from an import row — and is used only
 * for the message.
 */
export function checkTopicOwnership(input: {
  topicRef: string | null;
  topicSubjectId: string | null;
  subjectId: string;
}): InvariantIssue | null {
  if (!input.topicRef) return null;

  if (!input.topicSubjectId) {
    return { field: "topicId", message: `Unknown topic: "${input.topicRef}".` };
  }

  if (input.topicSubjectId !== input.subjectId) {
    return {
      field: "topicId",
      message: `Topic "${input.topicRef}" belongs to a different subject.`,
    };
  }

  return null;
}
