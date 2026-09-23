/**
 * Month bucketing and comparison rules for the admin analytics panel.
 *
 * Database-free, like `admin-stats`, so the calendar edges, the pro-rated
 * month-over-month comparison and the point-in-time subscriber count are all
 * tested without a database. `admin-analytics-data.ts` only moves rows.
 *
 * Months are Africa/Lagos calendar months: a signup at 23:30 UTC on 31 August
 * is a September signup to everyone running the business. Lagos has no DST,
 * so its offset is a constant and no timezone library is needed.
 */

import { resolveTier, type EntitlementRow } from "@/lib/billing/entitlement";
import type { SubscriptionSource } from "@/lib/subscription";

const LAGOS_OFFSET_MS = 60 * 60 * 1000;

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

/** `YYYY-MM` in Africa/Lagos. Sorts lexicographically. */
export function lagosMonthKey(date: Date): string {
  const local = new Date(date.getTime() + LAGOS_OFFSET_MS);
  const month = String(local.getUTCMonth() + 1).padStart(2, "0");
  return `${local.getUTCFullYear()}-${month}`;
}

function parseKey(key: string): { year: number; month: number } {
  const [year, month] = key.split("-").map(Number);
  return { year, month: month - 1 };
}

/** The instant a Lagos month begins. */
export function monthStart(key: string): Date {
  const { year, month } = parseKey(key);
  return new Date(Date.UTC(year, month, 1) - LAGOS_OFFSET_MS);
}

/** The instant the following month begins — exclusive end of `key`. */
export function monthEnd(key: string): Date {
  const { year, month } = parseKey(key);
  return new Date(Date.UTC(year, month + 1, 1) - LAGOS_OFFSET_MS);
}

export function shiftMonth(key: string, by: number): string {
  const { year, month } = parseKey(key);
  const d = new Date(Date.UTC(year, month + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** `count` month keys, oldest first, ending with the month `now` falls in. */
export function trailingMonths(now: Date, count: number): string[] {
  const current = lagosMonthKey(now);
  return Array.from({ length: count }, (_, i) => shiftMonth(current, i - count + 1));
}

export function monthLabel(key: string): string {
  const { year, month } = parseKey(key);
  return `${MONTH_NAMES[month]} ${year}`;
}

export function shortMonthLabel(key: string): string {
  return MONTH_NAMES[parseKey(key).month];
}

export type Window = { start: Date; end: Date };

/**
 * This month so far, and the same stretch of last month.
 *
 * Comparing a month-to-date figure against a whole previous month makes every
 * metric look like it crashed on the 3rd. Instead the previous window covers
 * the same elapsed time from the start of last month — clamped to that month,
 * since the 31st of this month has no counterpart in a 30-day one.
 */
export function comparisonWindows(now: Date): { current: Window; previous: Window } {
  const key = lagosMonthKey(now);
  const start = monthStart(key);
  const prevKey = shiftMonth(key, -1);
  const prevStart = monthStart(prevKey);
  const elapsed = now.getTime() - start.getTime();
  const prevEnd = Math.min(prevStart.getTime() + elapsed, monthEnd(prevKey).getTime());
  return {
    current: { start, end: now },
    previous: { start: prevStart, end: new Date(prevEnd) },
  };
}

/** The instant one calendar month before `now` — for point-in-time stocks. */
export function sameInstantLastMonth(now: Date): Date {
  return comparisonWindows(now).previous.end;
}

/**
 * Whole-number percentage change, or null when there is no base to compare
 * against. "+∞%" is not a figure anyone can act on.
 */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

export type Comparison = {
  current: number;
  previous: number;
  change: number | null;
};

export function compare(current: number, previous: number): Comparison {
  return { current, previous, change: percentChange(current, previous) };
}

// ─── Subscriptions ────────────────────────────────────────

export type AnalyticsSubscriptionRow = EntitlementRow & {
  userId: string;
  source: SubscriptionSource;
  amountKobo: number;
  paidAt: Date | null;
};

export type SubscriberCount = {
  standard: number;
  premium: number;
  total: number;
  /** Subscribers with at least one paid term live — the rest are comps. */
  paid: number;
};

/**
 * Who held a paid tier at `at`, by the same rule entitlement gates use. Each
 * user counts once, at their richest live tier — a comped PREMIUM over a paid
 * STANDARD is one Premium subscriber, not two.
 */
export function subscribersAt(
  rows: readonly AnalyticsSubscriptionRow[],
  at: Date,
): SubscriberCount {
  const byUser = new Map<string, AnalyticsSubscriptionRow[]>();
  for (const row of rows) {
    const list = byUser.get(row.userId);
    if (list) list.push(row);
    else byUser.set(row.userId, [row]);
  }

  const count: SubscriberCount = { standard: 0, premium: 0, total: 0, paid: 0 };
  for (const userRows of byUser.values()) {
    const { tier } = resolveTier(userRows, at);
    if (tier === "FREEMIUM") continue;
    count.total += 1;
    if (tier === "PREMIUM") count.premium += 1;
    else count.standard += 1;
    // Same coverage rule as resolveTier, narrowed to paid rows.
    if (
      userRows.some(
        (r) => r.source === "PAYSTACK" && resolveTier([r], at).tier !== "FREEMIUM",
      )
    ) {
      count.paid += 1;
    }
  }
  return count;
}

/** Settled Paystack revenue in kobo, paid within `window`. Comps are free. */
export function revenueIn(
  rows: readonly AnalyticsSubscriptionRow[],
  window: Window,
): number {
  const start = window.start.getTime();
  const end = window.end.getTime();
  return rows.reduce((sum, row) => {
    if (row.source !== "PAYSTACK" || row.status !== "ACTIVE" || !row.paidAt) return sum;
    const t = row.paidAt.getTime();
    return t >= start && t < end ? sum + row.amountKobo : sum;
  }, 0);
}

// ─── Monthly series ───────────────────────────────────────

export type MonthlyPoint = {
  month: string;
  label: string;
  /** False for the current month, whose figures are still accruing. */
  complete: boolean;
  signups: number;
  totalUsers: number;
  standard: number;
  premium: number;
  subscribers: number;
  revenueKobo: number;
  activeLearners: number;
  assessmentsCompleted: number;
};

export type MonthlyInputs = {
  months: readonly string[];
  now: Date;
  /** Students created before the first month in `months`. */
  usersBefore: number;
  signupsByMonth: ReadonlyMap<string, number>;
  activeLearnersByMonth: ReadonlyMap<string, number>;
  assessmentsByMonth: ReadonlyMap<string, number>;
  subscriptions: readonly AnalyticsSubscriptionRow[];
};

/**
 * One point per month. Subscribers are a stock, read at the month's close (or
 * now, for the month still in progress); everything else is a flow summed
 * across the month.
 */
export function buildMonthlySeries(input: MonthlyInputs): MonthlyPoint[] {
  const current = lagosMonthKey(input.now);
  let running = input.usersBefore;

  return input.months.map((month) => {
    const complete = month < current;
    const signups = input.signupsByMonth.get(month) ?? 0;
    running += signups;

    // A term ending at exactly the month boundary has ended (resolveTier is
    // end-exclusive), so read one millisecond before the next month begins.
    const at = complete ? new Date(monthEnd(month).getTime() - 1) : input.now;
    const subs = subscribersAt(input.subscriptions, at);

    return {
      month,
      label: complete ? monthLabel(month) : `${monthLabel(month)} (to date)`,
      complete,
      signups,
      totalUsers: running,
      standard: subs.standard,
      premium: subs.premium,
      subscribers: subs.total,
      revenueKobo: revenueIn(input.subscriptions, {
        start: monthStart(month),
        end: monthEnd(month),
      }),
      activeLearners: input.activeLearnersByMonth.get(month) ?? 0,
      assessmentsCompleted: input.assessmentsByMonth.get(month) ?? 0,
    };
  });
}

/** Share of students holding a paid tier, as a whole-number percentage. */
export function conversionRate(subscribers: number, students: number): number {
  return students > 0 ? Math.round((subscribers / students) * 100) : 0;
}

// ─── Renewals ─────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;

export type RenewalHealth = {
  /** Paying subscribers whose paid cover ends inside the horizon. */
  dueSoon: number;
  /** What those subscribers last paid — revenue that walks if none renew. */
  dueSoonKobo: number;
  /** The part of `dueSoon` ending within 7 days: this week's call list. */
  dueThisWeek: number;
  /** Paid terms that ended inside the look-back, by whether the user came back. */
  renewed: number;
  lapsed: number;
  /** renewed ÷ (renewed + lapsed), or null with nothing to judge. */
  renewalRate: number | null;
};

/**
 * Terms are prepaid and never auto-renew, so every paying subscriber has a
 * date on which they either pay again or drop to Freemium. Looks `days`
 * forward for renewals falling due and the same distance back for terms that
 * already ended. Comps are left out on both sides: nobody renews a gift.
 */
export function renewalHealth(
  rows: readonly AnalyticsSubscriptionRow[],
  now: Date,
  days = 30,
): RenewalHealth {
  const t = now.getTime();
  const horizon = t + days * DAY_MS;
  const lookBack = t - days * DAY_MS;
  const week = t + 7 * DAY_MS;

  const byUser = new Map<string, AnalyticsSubscriptionRow[]>();
  for (const row of rows) {
    if (row.source !== "PAYSTACK" || row.status !== "ACTIVE" || !row.endsAt) continue;
    const list = byUser.get(row.userId);
    if (list) list.push(row);
    else byUser.set(row.userId, [row]);
  }

  const health: RenewalHealth = {
    dueSoon: 0,
    dueSoonKobo: 0,
    dueThisWeek: 0,
    renewed: 0,
    lapsed: 0,
    renewalRate: null,
  };

  for (const userRows of byUser.values()) {
    const live = resolveTier(userRows, now).tier !== "FREEMIUM";
    // An early renewal stacks a second term after the first, so the cover
    // runs to the furthest end, not the nearest.
    const last = userRows.reduce((a, b) => (b.endsAt!.getTime() > a.endsAt!.getTime() ? b : a));
    const end = last.endsAt!.getTime();

    if (live && end <= horizon) {
      health.dueSoon += 1;
      health.dueSoonKobo += last.amountKobo;
      if (end <= week) health.dueThisWeek += 1;
    }

    const endedRecently = userRows.some((r) => {
      const e = r.endsAt!.getTime();
      return e > lookBack && e <= t;
    });
    if (endedRecently) {
      if (live) health.renewed += 1;
      else health.lapsed += 1;
    }
  }

  const judged = health.renewed + health.lapsed;
  health.renewalRate = judged > 0 ? Math.round((health.renewed / judged) * 100) : null;
  return health;
}

// ─── Segments ─────────────────────────────────────────────

export type Segment = { label: string; students: number; subscribers: number; conversion: number };

/**
 * The largest `limit` segments by headcount, the rest folded into "Other" —
 * a long tail of two-student states reads as noise, not insight. "Not set"
 * always sorts last so it never pushes a real segment out of the list.
 */
export function topSegments(
  rows: readonly { label: string | null; students: number; subscribers: number }[],
  limit: number,
): Segment[] {
  const toSegment = (label: string, students: number, subscribers: number): Segment => ({
    label,
    students,
    subscribers,
    conversion: conversionRate(subscribers, students),
  });

  const known = rows
    .filter((r) => r.label !== null && r.students > 0)
    .sort((a, b) => b.students - a.students || a.label!.localeCompare(b.label!));
  const shown = known.slice(0, limit).map((r) => toSegment(r.label!, r.students, r.subscribers));

  const rest = known.slice(limit);
  if (rest.length > 0) {
    shown.push(
      toSegment(
        `Other (${rest.length})`,
        rest.reduce((n, r) => n + r.students, 0),
        rest.reduce((n, r) => n + r.subscribers, 0),
      ),
    );
  }

  const unset = rows.filter((r) => r.label === null);
  const unsetStudents = unset.reduce((n, r) => n + r.students, 0);
  if (unsetStudents > 0) {
    shown.push(toSegment("Not set", unsetStudents, unset.reduce((n, r) => n + r.subscribers, 0)));
  }
  return shown;
}
