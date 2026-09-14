import type { ClassLevel } from "../../lib/curriculum-scope";
import { addDays, daysBetween, type DayKey } from "./days";
import { RUNWAY_FRACTION, RUNWAY_MAX_DAYS, RUNWAY_MIN_DAYS } from "./plan";
import { SESSION_MINUTES } from "./slots";

export type PlanMode = "TERM" | "BLENDED" | "EXAM";

/**
 * Mode is derived, never stored, so a class change can't leave a stale mode
 * behind. An exam date that has passed counts as no exam: the plan follows the term.
 */
export function resolvePlanMode(p: {
  classLevel: ClassLevel | null;
  targetDate: DayKey | null;
  forceExamMode: boolean;
  today: DayKey;
}): PlanMode {
  if (p.classLevel !== "SS3" || !p.targetDate || p.targetDate < p.today) return "TERM";
  return p.forceExamMode ? "EXAM" : "BLENDED";
}

export const EXAM_SHARE_MIN = 0.1;
export const EXAM_SHARE_MAX = 0.5;
const RAMP_START_DAYS = 120;
const RAMP_END_DAYS = 42;

/** Fraction of a BLENDED plan's study time given to exam preparation. */
export function examShare(daysToExam: number): number {
  if (daysToExam >= RAMP_START_DAYS) return EXAM_SHARE_MIN;
  if (daysToExam <= RAMP_END_DAYS) return EXAM_SHARE_MAX;
  const progress = (RAMP_START_DAYS - daysToExam) / (RAMP_START_DAYS - RAMP_END_DAYS);
  return EXAM_SHARE_MIN + (EXAM_SHARE_MAX - EXAM_SHARE_MIN) * progress;
}

/** First day of the mock/past-questions runway: the last 20% of the plan, clamped 14..21 days. */
export function computeRunwayStart(planStart: DayKey, targetDate: DayKey): DayKey {
  const totalDays = Math.max(1, daysBetween(planStart, targetDate) + 1);
  const runwayDays = Math.min(
    RUNWAY_MAX_DAYS,
    Math.max(RUNWAY_MIN_DAYS, Math.round(totalDays * RUNWAY_FRACTION)),
    totalDays,
  );
  return addDays(targetDate, -(runwayDays - 1));
}

/** Suggested starting budgets; students can change them. */
export const DEFAULT_MINUTES: Record<ClassLevel, { weekdayMinutes: number; weekendMinutes: number }> = {
  SS1: { weekdayMinutes: 30, weekendMinutes: 60 },
  SS2: { weekdayMinutes: 45, weekendMinutes: 90 },
  SS3: { weekdayMinutes: 60, weekendMinutes: 120 },
};

export type PlanSettingsCheck = {
  classLevel: ClassLevel | null;
  targetDate: DayKey | null;
  forceExamMode: boolean;
  studyDays: readonly number[];
  weekdayMinutes: number;
  weekendMinutes: number;
  today: DayKey;
};

/** The rules zod can't express because they need the student's class or today's date. */
export function planSettingsProblem(input: PlanSettingsCheck): string | null {
  if (input.targetDate && input.classLevel !== "SS3") {
    return "Exam dates are for SS3 students. Your plan will follow your school term.";
  }
  if (input.forceExamMode && !input.targetDate) {
    return "Set an exam date before switching on exam mode.";
  }
  if (input.targetDate && input.targetDate <= input.today) {
    return "The exam date must be in the future.";
  }
  // Anything shorter than one full session only ever fits revision, and a
  // plan with no full session anywhere would stay empty.
  const hasTime = input.studyDays.some((day) =>
    (day >= 6 ? input.weekendMinutes : input.weekdayMinutes) >= SESSION_MINUTES,
  );
  if (!hasTime) {
    return "Choose at least one study day with 30 minutes or more.";
  }
  return null;
}
