import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeRunwayStart,
  examShare,
  planSettingsProblem,
  resolvePlanMode,
} from "../src/engines/planner/mode";

test("resolvePlanMode", () => {
  const today = "2026-09-14";
  assert.equal(resolvePlanMode({ classLevel: "SS1", targetDate: null, forceExamMode: false, today }), "TERM");
  // Exam fields are ignored below SS3 (a student whose class changed).
  assert.equal(resolvePlanMode({ classLevel: "SS2", targetDate: "2027-05-01", forceExamMode: true, today }), "TERM");
  assert.equal(resolvePlanMode({ classLevel: "SS3", targetDate: null, forceExamMode: false, today }), "TERM");
  assert.equal(resolvePlanMode({ classLevel: "SS3", targetDate: "2027-05-01", forceExamMode: false, today }), "BLENDED");
  assert.equal(resolvePlanMode({ classLevel: "SS3", targetDate: "2027-05-01", forceExamMode: true, today }), "EXAM");
});

test("resolvePlanMode: a passed exam date counts as no exam", () => {
  const today = "2026-09-14";
  assert.equal(resolvePlanMode({ classLevel: "SS3", targetDate: "2026-09-13", forceExamMode: false, today }), "TERM");
  assert.equal(resolvePlanMode({ classLevel: "SS3", targetDate: "2026-06-01", forceExamMode: true, today }), "TERM");
  // The exam day itself is still exam preparation.
  assert.equal(resolvePlanMode({ classLevel: "SS3", targetDate: today, forceExamMode: false, today }), "BLENDED");
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

test("planSettingsProblem needs one study day with a full 30-minute session", () => {
  const message = "Choose at least one study day with 30 minutes or more.";
  assert.equal(planSettingsProblem({ ...base, weekdayMinutes: 14 }), message);
  assert.equal(planSettingsProblem({ ...base, weekdayMinutes: 29 }), message);
  assert.equal(planSettingsProblem({ ...base, weekdayMinutes: 30 }), null);
  // A short weekday is fine when a chosen weekend day has a full session.
  assert.equal(planSettingsProblem({ ...base, studyDays: [1, 6], weekdayMinutes: 15, weekendMinutes: 30 }), null);
  // Weekend minutes don't count when no weekend day is chosen.
  assert.equal(planSettingsProblem({ ...base, weekdayMinutes: 15, weekendMinutes: 120 }), message);
});
