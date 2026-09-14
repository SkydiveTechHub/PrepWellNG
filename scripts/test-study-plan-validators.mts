import { test } from "node:test";
import assert from "node:assert/strict";
import {
  academicTermSchema,
  studyPlanItemStatusSchema,
  studyPlanPositionsSchema,
  studyPlanSettingsSchema,
} from "../src/lib/validators";

const settings = { subjectIds: ["m"], studyDays: [1, 3, 6], weekdayMinutes: 45, weekendMinutes: 90 };

test("term plan settings parse and default forceExamMode", () => {
  const parsed = studyPlanSettingsSchema.parse(settings);
  assert.equal(parsed.forceExamMode, false);
});

test("exam and exam date go together", () => {
  assert.equal(studyPlanSettingsSchema.safeParse({ ...settings, targetExam: "WAEC" }).success, false);
  assert.equal(studyPlanSettingsSchema.safeParse({ ...settings, targetDate: "2027-05-01" }).success, false);
  assert.equal(
    studyPlanSettingsSchema.safeParse({ ...settings, targetExam: "WAEC", targetDate: "2027-05-01" }).success,
    true,
  );
});

test("settings reject out-of-range values", () => {
  assert.equal(studyPlanSettingsSchema.safeParse({ ...settings, studyDays: [] }).success, false);
  assert.equal(studyPlanSettingsSchema.safeParse({ ...settings, studyDays: [0] }).success, false);
  assert.equal(studyPlanSettingsSchema.safeParse({ ...settings, weekdayMinutes: 481 }).success, false);
  assert.equal(studyPlanSettingsSchema.safeParse({ ...settings, targetExam: "WAEC", targetDate: "1 May" }).success, false);
});

test("positions, item status and academic terms", () => {
  assert.equal(studyPlanPositionsSchema.safeParse({ positions: [{ subjectId: "m", topicId: null }] }).success, true);
  assert.equal(studyPlanItemStatusSchema.safeParse({ status: "MISSED" }).success, false);
  assert.equal(
    academicTermSchema.safeParse({ session: "2026/2027", term: "FIRST", startsOn: "2026-09-08", endsOn: "2026-12-15" }).success,
    true,
  );
  assert.equal(
    academicTermSchema.safeParse({ session: "2026-27", term: "FIRST", startsOn: "2026-09-08", endsOn: "2026-12-15" }).success,
    false,
  );
});
