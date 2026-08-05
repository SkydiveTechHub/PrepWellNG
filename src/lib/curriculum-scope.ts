// Curriculum scope: a class level and term, or a span between two of them.
//
// Nigerian senior secondary runs SS1–SS3, three terms each, so the syllabus is
// nine ordered slots. A mock exam is scoped to a contiguous run of those slots
// — one term ("SS2 2nd term") or a range ("SS1 1st term to SS1 3rd term").

export const CLASS_LEVELS = ["SS1", "SS2", "SS3"] as const;
export const TERMS = ["FIRST", "SECOND", "THIRD"] as const;

export type ClassLevel = (typeof CLASS_LEVELS)[number];
export type Term = (typeof TERMS)[number];

export type ScopePoint = { classLevel: ClassLevel; term: Term };

export const TERM_LABELS: Record<Term, string> = {
  FIRST: "1st term",
  SECOND: "2nd term",
  THIRD: "3rd term",
};

export function scopeLabel(point: ScopePoint): string {
  return `${point.classLevel} ${TERM_LABELS[point.term]}`;
}

/**
 * Position in the nine-slot syllabus, SS1 1st term being 0.
 *
 * Ordering has to be explicit: comparing the enum values as strings would put
 * "FIRST" after "SECOND" alphabetically.
 */
export function scopeOrdinal(point: ScopePoint): number {
  return (
    CLASS_LEVELS.indexOf(point.classLevel) * TERMS.length +
    TERMS.indexOf(point.term)
  );
}

export function ordinalToScope(ordinal: number): ScopePoint {
  return {
    classLevel: CLASS_LEVELS[Math.floor(ordinal / TERMS.length)],
    term: TERMS[ordinal % TERMS.length],
  };
}

export const MIN_ORDINAL = 0;
export const MAX_ORDINAL = CLASS_LEVELS.length * TERMS.length - 1;

export function isValidScope(value: unknown): value is ScopePoint {
  if (!value || typeof value !== "object") return false;
  const point = value as ScopePoint;
  return (
    CLASS_LEVELS.includes(point.classLevel) && TERMS.includes(point.term)
  );
}

/**
 * Every slot from `from` to `to` inclusive.
 *
 * A reversed range is normalised rather than rejected — picking "SS2 to SS1"
 * in a pair of dropdowns is a slip, not a different intent.
 */
export function expandScopeRange(
  from: ScopePoint,
  to: ScopePoint,
): ScopePoint[] {
  const a = scopeOrdinal(from);
  const b = scopeOrdinal(to);
  const start = Math.min(a, b);
  const end = Math.max(a, b);

  const slots: ScopePoint[] = [];
  for (let i = start; i <= end; i++) slots.push(ordinalToScope(i));
  return slots;
}

/** How the chosen scope reads back to the student. */
export function describeScopeRange(from: ScopePoint, to: ScopePoint): string {
  const a = scopeOrdinal(from);
  const b = scopeOrdinal(to);
  if (a === b) return scopeLabel(from);

  const [lo, hi] = a < b ? [from, to] : [to, from];
  // A whole class year is worth saying plainly.
  if (
    lo.classLevel === hi.classLevel &&
    lo.term === "FIRST" &&
    hi.term === "THIRD"
  ) {
    return `all of ${lo.classLevel}`;
  }
  return `${scopeLabel(lo)} to ${scopeLabel(hi)}`;
}

/** Number of syllabus slots the range covers. */
export function scopeSpan(from: ScopePoint, to: ScopePoint): number {
  return Math.abs(scopeOrdinal(from) - scopeOrdinal(to)) + 1;
}

export const ALL_SCOPES: ScopePoint[] = Array.from(
  { length: MAX_ORDINAL + 1 },
  (_, i) => ordinalToScope(i),
);
