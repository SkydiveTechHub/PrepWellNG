import { test } from "node:test";
import assert from "node:assert/strict";
import { currentStreak, lagosDayKey, previousDayKey } from "../src/lib/streak";

// ─── lagosDayKey ───────────────────────────────────────────

test("lagosDayKey buckets a late-night session into the local day", () => {
  // 00:30 on 4 Aug in Lagos is 23:30 on 3 Aug UTC. Bucketing by UTC — what the
  // old code did — filed this under the 3rd and broke the student's streak.
  const lateNight = new Date("2026-08-03T23:30:00Z");
  assert.equal(lagosDayKey(lateNight), "2026-08-04");
});

test("lagosDayKey agrees with UTC during the working day", () => {
  assert.equal(lagosDayKey(new Date("2026-08-04T09:00:00Z")), "2026-08-04");
});

test("lagosDayKey rolls the month over correctly", () => {
  assert.equal(lagosDayKey(new Date("2026-07-31T23:30:00Z")), "2026-08-01");
});

// ─── previousDayKey ────────────────────────────────────────

test("previousDayKey steps back across a month boundary", () => {
  assert.equal(previousDayKey("2026-08-01"), "2026-07-31");
});

test("previousDayKey steps back across a year boundary", () => {
  assert.equal(previousDayKey("2026-01-01"), "2025-12-31");
});

test("previousDayKey handles a leap day", () => {
  assert.equal(previousDayKey("2028-03-01"), "2028-02-29");
});

// ─── currentStreak ─────────────────────────────────────────

test("currentStreak counts consecutive days ending today", () => {
  const days = ["2026-08-04", "2026-08-03", "2026-08-02"];
  assert.equal(currentStreak(days, "2026-08-04"), 3);
});

test("currentStreak is 0 when today is missing", () => {
  // Studied yesterday and before, but not today — the streak is broken.
  const days = ["2026-08-03", "2026-08-02", "2026-08-01"];
  assert.equal(currentStreak(days, "2026-08-04"), 0);
});

test("currentStreak stops at the first gap", () => {
  const days = ["2026-08-04", "2026-08-03", "2026-08-01", "2026-07-31"];
  assert.equal(currentStreak(days, "2026-08-04"), 2);
});

test("currentStreak ignores duplicate entries for the same day", () => {
  const days = ["2026-08-04", "2026-08-04", "2026-08-03"];
  assert.equal(currentStreak(days, "2026-08-04"), 2);
});

test("currentStreak counts a single day", () => {
  assert.equal(currentStreak(["2026-08-04"], "2026-08-04"), 1);
});

test("currentStreak on no activity is 0", () => {
  assert.equal(currentStreak([], "2026-08-04"), 0);
});

test("currentStreak spans a month boundary", () => {
  const days = ["2026-08-01", "2026-07-31", "2026-07-30"];
  assert.equal(currentStreak(days, "2026-08-01"), 3);
});
