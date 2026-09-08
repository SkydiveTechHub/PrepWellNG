// The years a student may pick a past paper from.
//
// Listing only the years we already hold was a deadlock: a paper nobody had
// fetched could never be selected, and a paper nobody selects never gets
// fetched. So the pickers offer the whole modern record and let the click
// decide — the provider draw happens on demand behind the year card.

/** Where the modern past-paper record starts for WAEC/JAMB/NECO. */
export const EXAM_YEAR_FLOOR = 2000;

/**
 * Every selectable exam year, newest first.
 *
 * Spans `EXAM_YEAR_FLOOR` to the current year, widened at either end by
 * anything we actually hold — an older paper stays reachable rather than
 * dropping off the bottom of the list.
 */
export function examYearRange(
  knownYears: readonly (number | null | undefined)[] = [],
  now: Date = new Date(),
): number[] {
  const known = knownYears.filter(
    (y): y is number => typeof y === "number" && Number.isInteger(y) && y > 0,
  );

  const newest = Math.max(now.getFullYear(), ...known);
  const oldest = Math.min(EXAM_YEAR_FLOOR, ...known);

  const years: number[] = [];
  for (let y = newest; y >= oldest; y--) years.push(y);
  return years;
}
