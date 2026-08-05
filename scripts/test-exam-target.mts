import { test } from "node:test";
import assert from "node:assert/strict";
import { daysUntilExam, examTargetFor } from "../src/lib/exam-target";

// Well before the May sitting.
const JANUARY_2026 = new Date("2026-01-15T09:00:00+01:00");
// Well after it.
const AUGUST_2026 = new Date("2026-08-04T09:00:00+01:00");

test("an SS3 student aims at this year's sitting", () => {
  const target = examTargetFor({ classLevel: "SS3", now: JANUARY_2026 });
  assert.equal(target.label, "WAEC 2026");
});

test("SS2 sits a year later than SS3", () => {
  assert.equal(
    examTargetFor({ classLevel: "SS2", now: JANUARY_2026 }).label,
    "WAEC 2027",
  );
});

test("SS1 sits two years later than SS3", () => {
  assert.equal(
    examTargetFor({ classLevel: "SS1", now: JANUARY_2026 }).label,
    "WAEC 2028",
  );
});

test("once this year's sitting has passed, SS3 rolls to the next", () => {
  // The whole point of deriving it: a hard-coded date silently goes stale.
  assert.equal(
    examTargetFor({ classLevel: "SS3", now: AUGUST_2026 }).label,
    "WAEC 2027",
  );
});

test("an unknown class level is treated as sitting next", () => {
  assert.equal(
    examTargetFor({ classLevel: null, now: JANUARY_2026 }).label,
    "WAEC 2026",
  );
  assert.equal(
    examTargetFor({ classLevel: "JSS3", now: JANUARY_2026 }).label,
    "WAEC 2026",
  );
});

test("JAMB sits earlier in the year than WAEC", () => {
  const jamb = examTargetFor({ classLevel: "SS3", board: "JAMB", now: JANUARY_2026 });
  const waec = examTargetFor({ classLevel: "SS3", board: "WAEC", now: JANUARY_2026 });
  assert.equal(jamb.label, "JAMB 2026");
  assert.ok(jamb.date.getTime() < waec.date.getTime());
});

test("NECO is supported as a board", () => {
  assert.equal(
    examTargetFor({ classLevel: "SS3", board: "NECO", now: JANUARY_2026 }).label,
    "NECO 2026",
  );
});

test("the sitting date is pinned to WAT, not the server's zone", () => {
  const target = examTargetFor({ classLevel: "SS3", now: JANUARY_2026 });
  assert.equal(target.date.toISOString(), "2026-05-03T08:00:00.000Z");
});

test("daysUntilExam counts whole days", () => {
  const target = examTargetFor({ classLevel: "SS3", now: JANUARY_2026 });
  // 15 Jan to 3 May 2026 is 108 days.
  assert.equal(daysUntilExam(target, JANUARY_2026), 108);
});

test("daysUntilExam never returns a negative", () => {
  const target = { label: "WAEC 2020", date: new Date("2020-05-03T09:00:00+01:00") };
  assert.equal(daysUntilExam(target, AUGUST_2026), 0);
});
