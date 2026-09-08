import { test } from "node:test";
import assert from "node:assert/strict";
import { addMonthsUTC, termStart, termEnd } from "../src/lib/billing/term";

const iso = (d: Date) => d.toISOString();

test("a monthly term ends one month later", () => {
  const start = new Date("2026-09-04T10:00:00.000Z");
  assert.equal(iso(termEnd(start, "MONTHLY")), "2026-10-04T10:00:00.000Z");
});

test("a yearly term ends one year later", () => {
  const start = new Date("2026-09-04T10:00:00.000Z");
  assert.equal(iso(termEnd(start, "YEARLY")), "2027-09-04T10:00:00.000Z");
});

test("month-end dates clamp instead of overflowing", () => {
  // Jan 31 + 1 month must be Feb 28, not Mar 3. Naive setUTCMonth overflows.
  const jan31 = new Date("2027-01-31T00:00:00.000Z");
  assert.equal(iso(addMonthsUTC(jan31, 1)), "2027-02-28T00:00:00.000Z");
});

test("a leap day clamps on a non-leap year", () => {
  const leap = new Date("2028-02-29T00:00:00.000Z");
  assert.equal(iso(addMonthsUTC(leap, 12)), "2029-02-28T00:00:00.000Z");
});

test("a first purchase starts now", () => {
  const now = new Date("2026-09-04T10:00:00.000Z");
  assert.equal(iso(termStart(now, null)), iso(now));
});

test("a purchase while still subscribed stacks onto the remaining time", () => {
  // The whole point: paying twice must extend, never overwrite. A user who
  // renews early has not thrown away the time they already paid for.
  const now = new Date("2026-09-04T10:00:00.000Z");
  const endsAt = new Date("2026-12-01T00:00:00.000Z");
  assert.equal(iso(termStart(now, endsAt)), iso(endsAt));
});

test("a purchase after expiry starts now, not at the old end", () => {
  const now = new Date("2026-09-04T10:00:00.000Z");
  const expired = new Date("2026-01-01T00:00:00.000Z");
  assert.equal(iso(termStart(now, expired)), iso(now));
});

test("stacking a year onto a live term lands a year after that term ends", () => {
  const now = new Date("2026-09-04T10:00:00.000Z");
  const endsAt = new Date("2026-12-01T00:00:00.000Z");
  const start = termStart(now, endsAt);
  assert.equal(iso(termEnd(start, "YEARLY")), "2027-12-01T00:00:00.000Z");
});
