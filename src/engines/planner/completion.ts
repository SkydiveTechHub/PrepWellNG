import { addDays, type DayKey } from "./days";
import type { PlanActivityType } from "./plan";

// Which plan session a piece of learning activity completes. Pure: the DB side
// lives in src/lib/study-plan-completion.ts.

export type PlanItemStatusValue = "PENDING" | "COMPLETED" | "SKIPPED" | "MISSED";

export type TrackedItem = {
  id: string;
  date: DayKey;
  subjectId: string;
  topicId: string | null;
  activityType: PlanActivityType;
  status: PlanItemStatusValue;
};

export type CompletionSignal =
  | { kind: "LESSON_COMPLETED"; topicId: string }
  | { kind: "TOPIC_QUIZ"; topicIds: readonly string[] }
  | { kind: "CARD_REVIEWED"; topicId: string }
  | { kind: "MOCK_EXAM" }
  | { kind: "PAST_PAPER"; subjectId: string | null };

/** The oldest open session on or before today that the activity satisfies. */
export function pickItemToComplete(
  items: readonly TrackedItem[],
  signal: CompletionSignal,
  today: DayKey,
): string | null {
  const open = items
    .filter((i) => i.status === "PENDING" && i.date <= today)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const first = (match: (i: TrackedItem) => boolean) => open.find(match)?.id ?? null;

  switch (signal.kind) {
    case "LESSON_COMPLETED":
      return first((i) => i.activityType === "LESSON" && i.topicId === signal.topicId);
    case "TOPIC_QUIZ": {
      const topics = new Set(signal.topicIds);
      const onTopic = (i: TrackedItem) => i.topicId !== null && topics.has(i.topicId);
      return (
        first((i) => i.activityType === "PRACTICE" && onTopic(i)) ??
        first((i) => i.activityType === "REVISION" && onTopic(i))
      );
    }
    case "CARD_REVIEWED":
      return first((i) => i.activityType === "REVISION" && i.topicId === signal.topicId);
    case "MOCK_EXAM":
      return first((i) => i.activityType === "MOCK_EXAM");
    case "PAST_PAPER":
      return first(
        (i) =>
          i.activityType === "PAST_QUESTIONS" &&
          (signal.subjectId === null || i.subjectId === signal.subjectId),
      );
  }
}

export function signalForAssessment(input: {
  assessmentType: string;
  subjectId: string | null;
  topicIds: readonly string[];
  practiceExit: boolean;
}): CompletionSignal | null {
  if (!input.practiceExit) {
    if (input.assessmentType === "MOCK_EXAM" || input.assessmentType === "CBT_PRACTICE") {
      return { kind: "MOCK_EXAM" };
    }
    if (input.assessmentType === "PAST_PAPER") {
      return { kind: "PAST_PAPER", subjectId: input.subjectId };
    }
  }
  return input.topicIds.length > 0 ? { kind: "TOPIC_QUIZ", topicIds: [...input.topicIds] } : null;
}

export type ManualStatus = "COMPLETED" | "SKIPPED" | "PENDING";

export const MANUAL_LOOKBACK_DAYS = 7;

export function manualStatusChange(
  item: { date: DayKey },
  requested: ManualStatus,
  today: DayKey,
  plannedThrough: DayKey | null,
): { ok: true; status: PlanItemStatusValue } | { ok: false; error: string } {
  const tooOld = item.date < addDays(today, -MANUAL_LOOKBACK_DAYS);
  const tooFar = plannedThrough !== null && item.date > plannedThrough;
  if (tooOld || tooFar) {
    return { ok: false, error: "This session can no longer be changed." };
  }
  if (requested === "PENDING") {
    return { ok: true, status: item.date < today ? "MISSED" : "PENDING" };
  }
  return { ok: true, status: requested };
}
