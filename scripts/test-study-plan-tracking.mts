import { test } from "node:test";
import assert from "node:assert/strict";
import {
  manualStatusChange,
  pickItemToComplete,
  signalForAssessment,
  type TrackedItem,
} from "../src/engines/planner/completion";
import { isReplanStale, partitionForReplan, type ExistingItem } from "../src/engines/planner/replan";

const TODAY = "2026-09-14";

function item(id: string, overrides: Partial<ExistingItem> = {}): ExistingItem {
  return {
    id, date: TODAY, subjectId: "maths", topicId: "t1", activityType: "LESSON",
    status: "PENDING", durationMinutes: 30, ...overrides,
  };
}

test("a lesson completes the oldest matching pending lesson on or before today", () => {
  const items: TrackedItem[] = [
    item("today", { date: TODAY }),
    item("older", { date: "2026-09-12" }),
    item("future", { date: "2026-09-15" }),
    item("other-topic", { date: "2026-09-10", topicId: "t2" }),
  ];
  assert.equal(pickItemToComplete(items, { kind: "LESSON_COMPLETED", topicId: "t1" }, TODAY), "older");
});

test("future sessions and finished sessions are never auto-completed", () => {
  const items: TrackedItem[] = [
    item("future", { date: "2026-09-15" }),
    item("done", { status: "COMPLETED" }),
    item("missed", { status: "MISSED", date: "2026-09-10" }),
  ];
  assert.equal(pickItemToComplete(items, { kind: "LESSON_COMPLETED", topicId: "t1" }, TODAY), null);
});

test("a topic quiz completes practice before revision", () => {
  const items: TrackedItem[] = [
    item("rev", { activityType: "REVISION", date: "2026-09-10" }),
    item("prac", { activityType: "PRACTICE" }),
  ];
  assert.equal(pickItemToComplete(items, { kind: "TOPIC_QUIZ", topicIds: ["t1", "t9"] }, TODAY), "prac");
  assert.equal(pickItemToComplete([items[0]], { kind: "TOPIC_QUIZ", topicIds: ["t1"] }, TODAY), "rev");
});

test("cards, mocks and past papers match their own activity", () => {
  const items: TrackedItem[] = [
    item("rev", { activityType: "REVISION" }),
    item("mock", { activityType: "MOCK_EXAM", topicId: null }),
    item("pq-eng", { activityType: "PAST_QUESTIONS", topicId: null, subjectId: "english" }),
    item("pq-maths", { activityType: "PAST_QUESTIONS", topicId: null }),
  ];
  assert.equal(pickItemToComplete(items, { kind: "CARD_REVIEWED", topicId: "t1" }, TODAY), "rev");
  assert.equal(pickItemToComplete(items, { kind: "MOCK_EXAM" }, TODAY), "mock");
  assert.equal(pickItemToComplete(items, { kind: "PAST_PAPER", subjectId: "maths" }, TODAY), "pq-maths");
});

test("signalForAssessment maps assessment types", () => {
  const base = { subjectId: "maths", topicIds: ["t1"], practiceExit: false };
  assert.deepEqual(signalForAssessment({ ...base, assessmentType: "MOCK_EXAM" }), { kind: "MOCK_EXAM" });
  assert.deepEqual(signalForAssessment({ ...base, assessmentType: "CBT_PRACTICE" }), { kind: "MOCK_EXAM" });
  assert.deepEqual(signalForAssessment({ ...base, assessmentType: "PAST_PAPER" }), { kind: "PAST_PAPER", subjectId: "maths" });
  assert.deepEqual(signalForAssessment({ ...base, assessmentType: "TOPIC_QUIZ" }), { kind: "TOPIC_QUIZ", topicIds: ["t1"] });
  // A lesson's practice exit is topic practice even when its paper is exam-sourced.
  assert.deepEqual(
    signalForAssessment({ ...base, assessmentType: "PAST_PAPER", practiceExit: true }),
    { kind: "TOPIC_QUIZ", topicIds: ["t1"] },
  );
  assert.equal(signalForAssessment({ ...base, assessmentType: "TOPIC_QUIZ", topicIds: [] }), null);
});

test("manualStatusChange limits the date range and turns a past undo into missed", () => {
  const plannedThrough = "2026-09-27";
  assert.deepEqual(manualStatusChange({ date: TODAY }, "COMPLETED", TODAY, plannedThrough), { ok: true, status: "COMPLETED" });
  assert.deepEqual(manualStatusChange({ date: "2026-09-10" }, "PENDING", TODAY, plannedThrough), { ok: true, status: "MISSED" });
  assert.deepEqual(manualStatusChange({ date: "2026-09-15" }, "PENDING", TODAY, plannedThrough), { ok: true, status: "PENDING" });
  assert.equal(manualStatusChange({ date: "2026-09-06" }, "COMPLETED", TODAY, plannedThrough).ok, false);
  assert.equal(manualStatusChange({ date: "2026-09-28" }, "SKIPPED", TODAY, plannedThrough).ok, false);
});

test("isReplanStale compares Lagos days", () => {
  const now = new Date("2026-09-14T08:00:00Z");
  assert.equal(isReplanStale(null, now), true);
  assert.equal(isReplanStale(new Date("2026-09-14T00:30:00Z"), now), false);
  // 23:30 UTC on the 13th is 00:30 on the 14th in Lagos.
  assert.equal(isReplanStale(new Date("2026-09-13T23:30:00Z"), now), false);
  assert.equal(isReplanStale(new Date("2026-09-13T22:30:00Z"), now), true);
});

test("partitionForReplan keeps finished work, drops future pending, carries missed topics", () => {
  const items: ExistingItem[] = [
    item("past-pending", { date: "2026-09-12", topicId: "a" }),
    item("old-missed", { date: "2026-08-20", status: "MISSED", topicId: "old" }),
    item("recent-missed", { date: "2026-09-10", status: "MISSED", topicId: "a" }),
    item("today-pending", { date: TODAY }),
    item("future-pending", { date: "2026-09-20" }),
    item("today-done", { date: TODAY, status: "COMPLETED", subjectId: "english", durationMinutes: 45 }),
    item("future-skipped", { date: "2026-09-16", status: "SKIPPED" }),
    item("past-done", { date: "2026-09-11", status: "COMPLETED" }),
    item("missed-no-topic", { date: "2026-09-13", status: "MISSED", topicId: null }),
  ];
  const p = partitionForReplan(items, TODAY);
  assert.deepEqual(p.markMissed, ["past-pending"]);
  assert.deepEqual(p.deletePending.sort(), ["future-pending", "today-pending"]);
  assert.deepEqual(p.fixed, [
    { date: TODAY, subjectId: "english", durationMinutes: 45 },
    { date: "2026-09-16", subjectId: "maths", durationMinutes: 30 },
  ]);
  // Topic "a" missed twice → one carry-over, dated the latest miss.
  assert.deepEqual(p.carryOver, [{ topicId: "a", subjectId: "maths", missedOn: "2026-09-12" }]);
});
