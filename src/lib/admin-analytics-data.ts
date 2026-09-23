import { Prisma } from "@prisma/client";
import { db } from "./db";
import {
  buildMonthlySeries,
  compare,
  comparisonWindows,
  conversionRate,
  monthStart,
  renewalHealth,
  revenueIn,
  sameInstantLastMonth,
  subscribersAt,
  topSegments,
  trailingMonths,
  type Comparison,
  type MonthlyPoint,
  type RenewalHealth,
  type Segment,
} from "./admin-analytics";
import { CLASS_LEVELS } from "./curriculum-scope";

/**
 * Database access for the analytics panel on the admin dashboard. The rules
 * live in `admin-analytics`; this file only counts rows.
 *
 * Month bucketing happens in SQL so a year of signups never loads into Node.
 * Prisma stores DateTime as UTC `timestamp`, hence the double AT TIME ZONE:
 * the first says "this is UTC", the second converts it to Lagos wall time.
 */

const MONTHS_SHOWN = 12;
/** Long enough for a signup to have had a fair chance to convert. */
export const FUNNEL_DAYS = 90;
const STATES_SHOWN = 6;
const DAY_MS = 24 * 60 * 60 * 1000;

export type AdminAnalytics = {
  kpis: {
    students: Comparison;
    signups: Comparison;
    subscribers: Comparison & { paid: number };
    revenueKobo: Comparison;
    activeLearners: Comparison;
    assessments: Comparison;
    conversion: Comparison;
  };
  series: MonthlyPoint[];
  renewals: RenewalHealth;
  /** Students who signed up in the last FUNNEL_DAYS, and how far each got. */
  funnel: { signedUp: number; practised: number; assessed: number; paid: number };
  byClassLevel: Segment[];
  byState: Segment[];
};

type MonthCount = { month: string; n: number };
type SegmentRow = { label: string | null; students: number; subscribers: number };

const lagosMonth = (column: Prisma.Sql) =>
  Prisma.sql`to_char((${column} AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Lagos', 'YYYY-MM')`;

function toMap(rows: MonthCount[]): Map<string, number> {
  return new Map(rows.map((r) => [r.month, r.n]));
}

export async function getAdminAnalytics(now: Date = new Date()): Promise<AdminAnalytics> {
  const months = trailingMonths(now, MONTHS_SHOWN);
  const since = monthStart(months[0]);
  const { current, previous } = comparisonWindows(now);
  const lastMonth = sameInstantLastMonth(now);
  const cohortStart = new Date(now.getTime() - FUNNEL_DAYS * DAY_MS);
  // The same cover rule as resolveTier, not the cached User.tier — that
  // column can trail a grant or an expiry, and the segments would then
  // disagree with the subscriber count above them.
  const liveSubscription = Prisma.sql`EXISTS (
    SELECT 1 FROM "Subscription" s
    WHERE s."userId" = "User"."id" AND s."status" = 'ACTIVE'
      AND s."endsAt" > ${now} AND (s."startsAt" IS NULL OR s."startsAt" <= ${now}))`;

  const [
    [users],
    signupsByMonth,
    [learners],
    learnersByMonth,
    [assessments],
    assessmentsByMonth,
    subscriptions,
    classLevels,
    states,
    [funnel],
  ] = await Promise.all([
    db.$queryRaw<
      { total: number; before: number; lastMonth: number; cur: number; prev: number }[]
    >`
      SELECT
        count(*)::int AS total,
        count(*) FILTER (WHERE "createdAt" < ${since})::int AS before,
        count(*) FILTER (WHERE "createdAt" < ${lastMonth})::int AS "lastMonth",
        count(*) FILTER (WHERE "createdAt" >= ${current.start} AND "createdAt" < ${current.end})::int AS cur,
        count(*) FILTER (WHERE "createdAt" >= ${previous.start} AND "createdAt" < ${previous.end})::int AS prev
      FROM "User"
      WHERE "role" = 'STUDENT'`,
    db.$queryRaw<MonthCount[]>`
      SELECT ${lagosMonth(Prisma.sql`"createdAt"`)} AS month, count(*)::int AS n
      FROM "User"
      WHERE "role" = 'STUDENT' AND "createdAt" >= ${since}
      GROUP BY 1`,
    db.$queryRaw<{ cur: number; prev: number }[]>`
      SELECT
        count(DISTINCT "studentId") FILTER (WHERE "occurredAt" >= ${current.start})::int AS cur,
        count(DISTINCT "studentId") FILTER (WHERE "occurredAt" < ${previous.end})::int AS prev
      FROM "LearningEvent"
      WHERE "occurredAt" >= ${previous.start} AND "occurredAt" < ${current.end}`,
    db.$queryRaw<MonthCount[]>`
      SELECT ${lagosMonth(Prisma.sql`"occurredAt"`)} AS month, count(DISTINCT "studentId")::int AS n
      FROM "LearningEvent"
      WHERE "occurredAt" >= ${since}
      GROUP BY 1`,
    db.$queryRaw<{ cur: number; prev: number }[]>`
      SELECT
        count(*) FILTER (WHERE "completedAt" >= ${current.start})::int AS cur,
        count(*) FILTER (WHERE "completedAt" < ${previous.end})::int AS prev
      FROM "AssessmentAttempt"
      WHERE "status" = 'COMPLETED'
        AND "completedAt" >= ${previous.start} AND "completedAt" < ${current.end}`,
    db.$queryRaw<MonthCount[]>`
      SELECT ${lagosMonth(Prisma.sql`"completedAt"`)} AS month, count(*)::int AS n
      FROM "AssessmentAttempt"
      WHERE "status" = 'COMPLETED' AND "completedAt" >= ${since}
      GROUP BY 1`,
    // Every row that could grant a tier or book revenue inside the window —
    // which also covers the renewal look-back and every term still running.
    // Non-ACTIVE rows grant nothing and were never paid for, so they stay out.
    // Staff test purchases are real rows but not customers: counting them put
    // a subscriber over a student base with no payers in it.
    db.subscription.findMany({
      where: {
        status: "ACTIVE",
        user: { role: "STUDENT" },
        OR: [{ endsAt: { gte: since } }, { paidAt: { gte: since } }],
      },
      select: {
        userId: true,
        tier: true,
        status: true,
        source: true,
        amountKobo: true,
        paidAt: true,
        startsAt: true,
        endsAt: true,
      },
    }),
    db.$queryRaw<SegmentRow[]>`
      SELECT "classLevel"::text AS label, count(*)::int AS students,
        count(*) FILTER (WHERE ${liveSubscription})::int AS subscribers
      FROM "User"
      WHERE "role" = 'STUDENT'
      GROUP BY 1`,
    db.$queryRaw<SegmentRow[]>`
      SELECT NULLIF("state", '') AS label, count(*)::int AS students,
        count(*) FILTER (WHERE ${liveSubscription})::int AS subscribers
      FROM "User"
      WHERE "role" = 'STUDENT'
      GROUP BY 1`,
    // Each step is counted against the whole cohort, not the step before it:
    // a student can pay without practising first, so this is not strictly nested.
    db.$queryRaw<{ signedUp: number; practised: number; assessed: number; paid: number }[]>`
      SELECT
        count(*)::int AS "signedUp",
        count(*) FILTER (WHERE EXISTS (
          SELECT 1 FROM "LearningEvent" e WHERE e."studentId" = u."id"))::int AS practised,
        count(*) FILTER (WHERE EXISTS (
          SELECT 1 FROM "AssessmentAttempt" a
          WHERE a."studentId" = u."id" AND a."status" = 'COMPLETED'))::int AS assessed,
        count(*) FILTER (WHERE EXISTS (
          SELECT 1 FROM "Subscription" s
          WHERE s."userId" = u."id" AND s."source" = 'PAYSTACK' AND s."status" = 'ACTIVE'))::int AS paid
      FROM "User" u
      WHERE u."role" = 'STUDENT' AND u."createdAt" >= ${cohortStart}`,
  ]);

  const subsNow = subscribersAt(subscriptions, now);
  const subsLastMonth = subscribersAt(subscriptions, lastMonth);

  const series = buildMonthlySeries({
    months,
    now,
    usersBefore: users.before,
    signupsByMonth: toMap(signupsByMonth),
    activeLearnersByMonth: toMap(learnersByMonth),
    assessmentsByMonth: toMap(assessmentsByMonth),
    subscriptions,
  });

  // Classes keep their natural SS1 → SS3 order; only states are ranked.
  const byClassLevel = [...CLASS_LEVELS, null].map((level): Segment => {
    const r = classLevels.find((c) => c.label === level);
    const students = r?.students ?? 0;
    const subscribers = r?.subscribers ?? 0;
    return {
      label: level ?? "Not set",
      students,
      subscribers,
      conversion: conversionRate(subscribers, students),
    };
  });

  return {
    kpis: {
      students: compare(users.total, users.lastMonth),
      signups: compare(users.cur, users.prev),
      subscribers: { ...compare(subsNow.total, subsLastMonth.total), paid: subsNow.paid },
      revenueKobo: compare(revenueIn(subscriptions, current), revenueIn(subscriptions, previous)),
      activeLearners: compare(learners.cur, learners.prev),
      assessments: compare(assessments.cur, assessments.prev),
      conversion: compare(
        conversionRate(subsNow.total, users.total),
        conversionRate(subsLastMonth.total, users.lastMonth),
      ),
    },
    series,
    renewals: renewalHealth(subscriptions, now),
    funnel,
    byClassLevel,
    byState: topSegments(states, STATES_SHOWN),
  };
}
