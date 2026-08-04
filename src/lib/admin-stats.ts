// Display shaping for the admin overview. Kept free of Prisma so the
// empty-database and rounding behaviour can be tested directly.

export type CountedSubject = {
  id: string;
  name: string;
  code: string;
  questionCount: number;
};

export type StatRow = {
  key: string;
  label: string;
  count: number;
  /** Whole-number percentage of the total; 0 when the total is 0. */
  percent: number;
};

export function toStatRows(
  counts: Array<{ key: string; label: string; count: number }>,
  total: number,
): StatRow[] {
  return counts.map((entry) => ({
    ...entry,
    percent: total > 0 ? Math.round((entry.count / total) * 100) : 0,
  }));
}

/**
 * Splits subjects into those with content and those without. A subject with
 * zero questions is a coverage gap worth surfacing, not a row reading "0".
 */
export function summariseSubjects(subjects: CountedSubject[]): {
  rows: StatRow[];
  empty: CountedSubject[];
  total: number;
} {
  const total = subjects.reduce((sum, s) => sum + s.questionCount, 0);
  const empty = subjects.filter((s) => s.questionCount === 0);
  const populated = subjects
    .filter((s) => s.questionCount > 0)
    .sort((a, b) => b.questionCount - a.questionCount);

  return {
    rows: toStatRows(
      populated.map((s) => ({ key: s.id, label: s.name, count: s.questionCount })),
      total,
    ),
    empty,
    total,
  };
}
