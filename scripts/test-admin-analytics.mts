import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildMonthlySeries,
  comparisonWindows,
  conversionRate,
  lagosMonthKey,
  monthEnd,
  monthStart,
  percentChange,
  renewalHealth,
  revenueIn,
  topSegments,
  subscribersAt,
  trailingMonths,
  type AnalyticsSubscriptionRow,
} from "../src/lib/admin-analytics";

function row(overrides: Partial<AnalyticsSubscriptionRow>): AnalyticsSubscriptionRow {
  return {
    userId: "u1",
    tier: "STANDARD",
    status: "ACTIVE",
    source: "PAYSTACK",
    amountKobo: 250_000,
    paidAt: new Date("2026-08-10T12:00:00Z"),
    startsAt: new Date("2026-08-10T12:00:00Z"),
    endsAt: new Date("2026-09-10T12:00:00Z"),
    ...overrides,
  };
}

test("a late-evening UTC signup on the last of the month lands in the next Lagos month", () => {
  assert.equal(lagosMonthKey(new Date("2026-08-31T23:30:00Z")), "2026-09");
  assert.equal(lagosMonthKey(new Date("2026-08-31T22:59:59Z")), "2026-08");
});

test("month bounds are Lagos midnight, expressed in UTC", () => {
  assert.equal(monthStart("2026-09").toISOString(), "2026-08-31T23:00:00.000Z");
  assert.equal(monthEnd("2026-12").toISOString(), "2026-12-31T23:00:00.000Z");
});

test("trailing months run oldest first and cross the year boundary", () => {
  assert.deepEqual(trailingMonths(new Date("2026-02-15T12:00:00Z"), 4), [
    "2025-11",
    "2025-12",
    "2026-01",
    "2026-02",
  ]);
});

test("the comparison window is the same elapsed stretch of last month", () => {
  const now = new Date("2026-09-21T11:00:00Z");
  const { current, previous } = comparisonWindows(now);
  assert.equal(current.start.toISOString(), "2026-08-31T23:00:00.000Z");
  assert.equal(previous.start.toISOString(), "2026-07-31T23:00:00.000Z");
  assert.equal(previous.end.toISOString(), "2026-08-21T11:00:00.000Z");
});

test("the comparison window is clamped to a shorter previous month", () => {
  // 31 March has no counterpart in February.
  const { previous } = comparisonWindows(new Date("2026-03-31T20:00:00Z"));
  assert.equal(previous.end.toISOString(), monthEnd("2026-02").toISOString());
});

test("percent change is null rather than infinite with no base", () => {
  assert.equal(percentChange(5, 0), null);
  assert.equal(percentChange(15, 10), 50);
  assert.equal(percentChange(5, 10), -50);
});

test("conversion rate is zero, not NaN, with no students", () => {
  assert.equal(conversionRate(0, 0), 0);
  assert.equal(conversionRate(1, 3), 33);
});

test("a user is counted once, at their richest live tier", () => {
  const rows = [
    row({ userId: "u1", tier: "STANDARD" }),
    row({ userId: "u1", tier: "PREMIUM", source: "COMP", amountKobo: 0 }),
    row({ userId: "u2", tier: "STANDARD" }),
  ];
  const count = subscribersAt(rows, new Date("2026-09-01T00:00:00Z"));
  assert.deepEqual(count, { standard: 1, premium: 1, total: 2, paid: 2 });
});

test("comp-only subscribers are not counted as paid", () => {
  const count = subscribersAt(
    [row({ source: "COMP", amountKobo: 0 })],
    new Date("2026-09-01T00:00:00Z"),
  );
  assert.equal(count.total, 1);
  assert.equal(count.paid, 0);
});

test("expired and non-active rows grant nothing", () => {
  const at = new Date("2026-09-15T00:00:00Z");
  const count = subscribersAt(
    [row({}), row({ userId: "u2", status: "REVOKED", endsAt: new Date("2026-10-01T00:00:00Z") })],
    at,
  );
  assert.equal(count.total, 0);
});

test("revenue counts settled Paystack payments only, inside the window", () => {
  const rows = [
    row({}),
    row({ source: "COMP", amountKobo: 0 }),
    row({ status: "PENDING", paidAt: null }),
    row({ paidAt: new Date("2026-07-10T00:00:00Z") }),
  ];
  const kobo = revenueIn(rows, { start: monthStart("2026-08"), end: monthEnd("2026-08") });
  assert.equal(kobo, 250_000);
});

test("the monthly series accumulates users and reads subscribers at each month's close", () => {
  const now = new Date("2026-09-21T11:00:00Z");
  const series = buildMonthlySeries({
    months: ["2026-07", "2026-08", "2026-09"],
    now,
    usersBefore: 10,
    signupsByMonth: new Map([
      ["2026-07", 2],
      ["2026-09", 5],
    ]),
    activeLearnersByMonth: new Map([["2026-08", 4]]),
    assessmentsByMonth: new Map(),
    subscriptions: [row({})],
  });

  assert.deepEqual(series.map((p) => p.totalUsers), [12, 12, 17]);
  // Subscribed 10 Aug to 10 Sep: live at August's close, lapsed by now.
  assert.deepEqual(series.map((p) => p.subscribers), [0, 1, 0]);
  assert.deepEqual(series.map((p) => p.revenueKobo), [0, 250_000, 0]);
  assert.deepEqual(series.map((p) => p.activeLearners), [0, 4, 0]);
  assert.deepEqual(series.map((p) => p.complete), [true, true, false]);
  assert.equal(series[2].label, "Sep 2026 (to date)");
});

test("renewals: due-soon subscribers are counted with the value at stake", () => {
  const now = new Date("2026-09-21T12:00:00Z");
  const h = renewalHealth(
    [
      // Ends in 4 days: due this week.
      row({ userId: "a", endsAt: new Date("2026-09-25T12:00:00Z"), startsAt: new Date("2026-08-25T12:00:00Z") }),
      // Ends in 20 days: due, not this week.
      row({ userId: "b", amountKobo: 900_000, endsAt: new Date("2026-10-11T12:00:00Z"), startsAt: new Date("2026-09-11T12:00:00Z") }),
      // Ends in 90 days: outside the horizon.
      row({ userId: "c", endsAt: new Date("2026-12-20T12:00:00Z"), startsAt: new Date("2026-09-20T12:00:00Z") }),
      // A comp is never "due".
      row({ userId: "d", source: "COMP", amountKobo: 0, endsAt: new Date("2026-09-24T12:00:00Z"), startsAt: new Date("2026-09-01T12:00:00Z") }),
    ],
    now,
  );
  assert.equal(h.dueSoon, 2);
  assert.equal(h.dueThisWeek, 1);
  assert.equal(h.dueSoonKobo, 1_150_000);
});

test("renewals: an early renewal stacks, so the user is not due", () => {
  const now = new Date("2026-09-21T12:00:00Z");
  const h = renewalHealth(
    [
      row({ userId: "a", startsAt: new Date("2026-08-25T12:00:00Z"), endsAt: new Date("2026-09-25T12:00:00Z") }),
      row({ userId: "a", startsAt: new Date("2026-09-25T12:00:00Z"), endsAt: new Date("2026-12-25T12:00:00Z") }),
    ],
    now,
  );
  assert.equal(h.dueSoon, 0);
});

test("renewals: ended terms split into renewed and lapsed", () => {
  const now = new Date("2026-09-21T12:00:00Z");
  const h = renewalHealth(
    [
      // Ended 11 days ago and paid again: renewed.
      row({ userId: "a", startsAt: new Date("2026-08-10T12:00:00Z"), endsAt: new Date("2026-09-10T12:00:00Z") }),
      row({ userId: "a", startsAt: new Date("2026-09-10T12:00:00Z"), endsAt: new Date("2026-10-10T12:00:00Z") }),
      // Ended 11 days ago, gone: lapsed.
      row({ userId: "b" }),
      // Ended 60 days ago: outside the look-back.
      row({ userId: "c", startsAt: new Date("2026-06-22T12:00:00Z"), endsAt: new Date("2026-07-22T12:00:00Z") }),
    ],
    now,
  );
  assert.equal(h.renewed, 1);
  assert.equal(h.lapsed, 1);
  assert.equal(h.renewalRate, 50);
});

test("renewals: the rate is null, not zero, when no term ended", () => {
  assert.equal(renewalHealth([], new Date("2026-09-21T12:00:00Z")).renewalRate, null);
});

test("segments keep the largest, fold the tail into Other and put Not set last", () => {
  const segs = topSegments(
    [
      { label: null, students: 9, subscribers: 0 },
      { label: "Lagos", students: 50, subscribers: 10 },
      { label: "Oyo", students: 20, subscribers: 2 },
      { label: "Kano", students: 5, subscribers: 1 },
      { label: "Edo", students: 3, subscribers: 0 },
    ],
    2,
  );
  assert.deepEqual(
    segs.map((s) => [s.label, s.students, s.subscribers, s.conversion]),
    [
      ["Lagos", 50, 10, 20],
      ["Oyo", 20, 2, 10],
      ["Other (2)", 8, 1, 13],
      ["Not set", 9, 0, 0],
    ],
  );
});
