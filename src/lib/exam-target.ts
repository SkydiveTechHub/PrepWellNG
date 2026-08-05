// Which exam a student is actually counting down to.
//
// The sidebar and mobile header previously hard-coded "WAEC 2027" for everyone
// — including SS1 students three years out and JAMB-only candidates.
//
// Derived from class level rather than stored, because nothing in the schema
// records a chosen sitting yet. An SS3 student is sitting the next available
// exam; SS2 sits the year after; SS1 the year after that.

export type ExamTarget = {
  /** e.g. "WAEC 2027" */
  label: string;
  /** Start of the sitting, in WAT. */
  date: Date;
};

/** WAEC/NECO school candidates sit around May; JAMB UTME runs in April. */
const SITTING = {
  WAEC: { month: 5, day: 3 },
  NECO: { month: 6, day: 7 },
  JAMB: { month: 4, day: 12 },
} as const;

export type ExamBoard = keyof typeof SITTING;

/** Years between now and the student's sitting, by class level. */
const YEARS_OUT: Record<string, number> = {
  SS3: 0,
  SS2: 1,
  SS1: 2,
};

/**
 * The next sitting for a student.
 *
 * `now` is injected so this can be tested and so callers on the server pass a
 * single consistent clock reading.
 */
export function examTargetFor({
  classLevel,
  board = "WAEC",
  now,
}: {
  classLevel?: string | null;
  board?: ExamBoard;
  now: Date;
}): ExamTarget {
  const sitting = SITTING[board] ?? SITTING.WAEC;
  const offset = YEARS_OUT[classLevel ?? ""] ?? 0;

  // Build the sitting in this year first, then push it out by the class offset.
  // If that date has already passed, the student is aiming at the next one.
  let year = now.getUTCFullYear() + offset;
  const candidate = () =>
    new Date(
      `${year}-${String(sitting.month).padStart(2, "0")}-${String(
        sitting.day,
      ).padStart(2, "0")}T09:00:00+01:00`,
    );

  if (candidate().getTime() <= now.getTime()) year += 1;

  return { label: `${board} ${year}`, date: candidate() };
}

/** Whole days from `now` until the sitting; never negative. */
export function daysUntilExam(target: ExamTarget, now: Date): number {
  return Math.max(
    0,
    Math.ceil((target.date.getTime() - now.getTime()) / 86_400_000),
  );
}
