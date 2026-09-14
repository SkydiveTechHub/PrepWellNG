import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeRunwayStart,
  examShare,
  planSettingsProblem,
  resolvePlanMode,
} from "../src/engines/planner/mode";

test("resolvePlanMode", () => {
  assert.equal(resolvePlanMode({ classLevel: "SS1", targetDate: null, forceExamMode: false }), "TERM");
  // Exam fields are ignored below SS3 (a student whose class changed).
  assert.equal(resolvePlanMode({ classLevel: "SS2", targetDate: "2027-05-01", forceExamMode: true }), "TERM");
  assert.equal(resolvePlanMode({ classLevel: "SS3", targetDate: null, forceExamMode: false }), "TERM");
  assert.equal(resolvePlanMode({ classLevel: "SS3", targetDate: "2027-05-01", forceExamMode: false }), "BLENDED");
  assert.equal(resolvePlanMode({ classLevel: "SS3", targetDate: "2027-05-01", forceExamMode: true }), "EXAM");
});

test("examShare ramps from 0.10 to 0.50", () => {
  assert.equal(examShare(150), 0.1);
  assert.equal(examShare(120), 0.1);
  assert.ok(Math.abs(examShare(90) - 0.2538) < 0.001);
  assert.equal(examShare(42), 0.5);
  assert.equal(examShare(10), 0.5);
});

test("computeRunwayStart clamps the runway to 14..21 days", () => {
  // 61 days → 20% is 12, clamped up to 14.
  assert.equal(computeRunwayStart("2026-09-14", "2026-11-13"), "2026-10-31");
  // 200 days → 20% is 40, clamped down to 21.
  assert.equal(computeRunwayStart("2026-09-14", "2027-04-01"), "2027-03-12");
  // A plan shorter than the minimum is all runway.
  assert.equal(computeRunwayStart("2026-09-14", "2026-09-20"), "2026-09-14");
});

const base = {
  classLevel: "SS3" as const,
  targetDate: null,
  forceExamMode: false,
  studyDays: [1, 2, 3],
  weekdayMinutes: 60,
  weekendMinutes: 0,
  today: "2026-09-14",
};

test("planSettingsProblem accepts a sensible plan", () => {
  assert.equal(planSettingsProblem(base), null);
  assert.equal(planSettingsProblem({ ...base, targetDate: "2027-05-01", forceExamMode: true }), null);
});

test("planSettingsProblem rejects bad combinations", () => {
  assert.match(planSettingsProblem({ ...base, classLevel: "SS2", targetDate: "2027-05-01" }) ?? "", /SS3/);
  assert.match(planSettingsProblem({ ...base, forceExamMode: true }) ?? "", /exam date/);
  assert.match(planSettingsProblem({ ...base, targetDate: "2026-09-14" }) ?? "", /future/);
  assert.match(planSettingsProblem({ ...base, studyDays: [6, 7] }) ?? "", /study day/);
});
