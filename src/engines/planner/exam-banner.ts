import { dateToDayKey, daysBetween, type DayKey } from "./days";
import { resolvePlanMode } from "./mode";

// What the sidebar countdown says, derived from the student's study plan.
//
// It used to be derived from class level alone, so every student saw one —
// including students who had never opened the planner. Now a student sees a
// countdown only once their own plan is counting down to a sitting.

export type ExamBanner = {
  /** e.g. "WAEC 2027" */
  label: string;
  /** Whole days from today until the sitting; never negative. */
  daysToExam: number;
};

export type ExamBannerPlan = {
  targetExam: string | null;
  targetDate: Date | null;
};

/**
 * The banner a plan earns, or null when it is not counting down to anything.
 *
 * Mode is resolved the same way the study plan page resolves it, so the two
 * surfaces can never disagree about whether an exam is in play: a TERM plan has
 * no sitting to show, and neither does a plan whose date has passed.
 */
export function examBannerFor({
  plan,
  classLevel,
  today,
}: {
  plan: ExamBannerPlan | null;
  /** Read straight off the session, so a plain string rather than `ClassLevel`. */
  classLevel?: string | null;
  today: DayKey;
}): ExamBanner | null {
  if (!plan) return null;

  const targetDate = plan.targetDate ? dateToDayKey(plan.targetDate) : null;
  const mode = resolvePlanMode({
    // Only SS3 changes the answer, so everything else narrows to null.
    classLevel: classLevel === "SS3" ? "SS3" : null,
    targetDate,
    // The countdown is about the date, not about how the days are divided up,
    // so a BLENDED plan earns the banner just as an EXAM one does.
    forceExamMode: false,
    today,
  });
  if (mode === "TERM" || !targetDate) return null;

  // `targetExam` and `targetDate` are written together or not at all — see the
  // refine in `studyPlanSettingsSchema` — so the board is normally known here.
  const label = `${plan.targetExam ?? "Exam"} ${targetDate.slice(0, 4)}`;
  return { label, daysToExam: Math.max(0, daysBetween(today, targetDate)) };
}
