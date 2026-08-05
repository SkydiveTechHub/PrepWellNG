// Study-day bucketing and streak counting. Pure — no database import — so the
// rules can be tested directly.

/**
 * Nigeria observes WAT (UTC+1) year-round. Study days must be bucketed in the
 * student's civil day: the previous code used `toISOString()`, so anything
 * studied between midnight and 1am local time was filed under the day before
 * and silently broke the streak.
 */
const LAGOS_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Africa/Lagos",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** `YYYY-MM-DD` in Africa/Lagos. Sorts lexicographically. */
export function lagosDayKey(date: Date): string {
  return LAGOS_DAY.format(date);
}

/** The calendar day before `key`, same `YYYY-MM-DD` format. */
export function previousDayKey(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  const prev = new Date(Date.UTC(y, m - 1, d));
  prev.setUTCDate(prev.getUTCDate() - 1);
  return prev.toISOString().slice(0, 10);
}

/**
 * Length of the unbroken run of study days ending today.
 *
 * Returns 0 when the student hasn't studied today — the streak is broken, not
 * merely stale. The old implementation compared date strings with `>=` against
 * today, which could never be true for a past date and made the "includes
 * today" guard behave inconsistently.
 */
export function currentStreak(days: Iterable<string>, today: string): number {
  const set = new Set(days);
  if (!set.has(today)) return 0;
  let streak = 0;
  let cursor = today;
  while (set.has(cursor)) {
    streak += 1;
    cursor = previousDayKey(cursor);
  }
  return streak;
}
