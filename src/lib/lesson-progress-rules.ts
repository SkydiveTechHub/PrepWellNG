// How a lesson progress write is allowed to move a StudentProgress row.
//
// Kept pure and separate from lesson-progress.ts so the rule can be tested
// without a database. It exists because three writers share one row: the lesson
// player (every card advance), the practice exit (`recordTopicPracticeResult`)
// and, through the PATCH endpoint, anything the client chooses to post. The
// player only ever knows about the sitting in front of it, so a naive write
// demoted a COMPLETED lesson to IN_PROGRESS and reset its percentage the moment
// a student re-opened it.

export type ProgressStatusValue = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";

export type ProgressRow = {
  status: ProgressStatusValue;
  completionPercent: number;
  checkpointData?: unknown;
};

export type ProgressPatch = {
  status?: ProgressStatusValue;
  completionPercent?: number;
  checkpointData?: unknown;
};

/** Only the fields that actually change; `undefined` means "leave it alone". */
export type ProgressWrite = {
  status?: ProgressStatusValue;
  completionPercent?: number;
  checkpointData?: unknown;
};

/**
 * Narrows a patch to the part of it that moves the row forward.
 *
 * - COMPLETED is a ceiling. Only another COMPLETED write may replace it, so
 *   re-reading a lesson, or failing a retake of its practice exit, cannot take
 *   away a completion the student earned by passing.
 * - `completionPercent` never decreases. The player reports the cards visited
 *   this sitting, which starts at one card on a return visit.
 * - `checkpointData` is shallow-merged. The blob is shared: the player owns
 *   `visited` and `checks`, the practice exit owns `practice`. Replacing it
 *   wholesale dropped the practice history behind mastery scoring and the
 *   result page's re-emit guard.
 */
export function forwardOnlyProgress(
  existing: ProgressRow | null | undefined,
  patch: ProgressPatch,
): ProgressWrite {
  const status =
    existing?.status === "COMPLETED" && patch.status !== "COMPLETED"
      ? undefined
      : patch.status;

  const completionPercent =
    patch.completionPercent === undefined
      ? undefined
      : Math.max(patch.completionPercent, existing?.completionPercent ?? 0);

  const checkpointData =
    patch.checkpointData === undefined
      ? undefined
      : mergeCheckpointData(existing?.checkpointData, patch.checkpointData);

  return {
    ...(status !== undefined && { status }),
    ...(completionPercent !== undefined && { completionPercent }),
    ...(checkpointData !== undefined && { checkpointData }),
  };
}

export type PracticeRecord = {
  attemptId: string;
  percentage: number;
  passed: boolean;
  at: string;
};

/**
 * Appends a scored practice attempt to the stored history, once per attempt.
 *
 * The list feeds `bestOfLastThree`, so a duplicate is not merely untidy: the
 * same attempt counted twice crowds out the two before it and inflates the
 * mastery score. Re-recording an attempt already in the list keeps the stored
 * entry — the first recording is the one that happened at submit time.
 */
export function withPracticeRecord(
  stored: readonly PracticeRecord[] | undefined,
  record: PracticeRecord,
): PracticeRecord[] {
  const history = stored ?? [];
  if (history.some((entry) => entry.attemptId === record.attemptId)) {
    return [...history];
  }
  return [...history, record];
}

/**
 * Shallow-merges an incoming checkpoint patch over the stored blob so keys the
 * writer does not own survive. Anything that is not a JSON object on either
 * side is replaced outright rather than guessed at.
 */
export function mergeCheckpointData(
  stored: unknown,
  incoming: unknown,
): unknown {
  if (!isJsonObject(stored) || !isJsonObject(incoming)) return incoming;
  return { ...stored, ...incoming };
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
