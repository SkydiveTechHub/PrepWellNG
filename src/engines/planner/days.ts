// Calendar-day arithmetic for the planner. Days are `YYYY-MM-DD` keys rather
// than Dates: the plan is laid out in the student's Lagos civil day, and a Date
// would silently re-bucket across the server's timezone.

export type DayKey = string;

const DAY_MS = 86_400_000;

function toUtcMs(key: DayKey): number {
  const [y, m, d] = key.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUtcMs(ms: number): DayKey {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(key: DayKey, days: number): DayKey {
  return fromUtcMs(toUtcMs(key) + days * DAY_MS);
}

/** `to - from` in whole days. */
export function daysBetween(from: DayKey, to: DayKey): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / DAY_MS);
}

/** ISO weekday: 1 = Monday … 7 = Sunday. */
export function isoWeekday(key: DayKey): number {
  const day = new Date(toUtcMs(key)).getUTCDay();
  return day === 0 ? 7 : day;
}

export function isWeekend(key: DayKey): boolean {
  return isoWeekday(key) >= 6;
}

export function mondayOf(key: DayKey): DayKey {
  return addDays(key, 1 - isoWeekday(key));
}

/** `@db.Date` columns are read and written by Prisma as UTC midnight. */
export function dayKeyToDate(key: DayKey): Date {
  return new Date(toUtcMs(key));
}

export function dateToDayKey(date: Date): DayKey {
  return date.toISOString().slice(0, 10);
}
