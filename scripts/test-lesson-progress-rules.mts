import { test } from "node:test";
import assert from "node:assert/strict";
import {
  forwardOnlyProgress,
  mergeCheckpointData,
  withPracticeRecord,
} from "../src/lib/lesson-progress-rules";

// Lesson progress is written by three parties into one row: the player on every
// card advance, the practice exit when an attempt is scored, and whatever the
// PATCH endpoint is handed. Only the practice exit may grant COMPLETED, and
// nothing may take it back — these tests pin that down.

test("a fresh row takes the patch as-is", () => {
  const write = forwardOnlyProgress(null, {
    status: "IN_PROGRESS",
    completionPercent: 20,
  });
  assert.deepEqual(write, { status: "IN_PROGRESS", completionPercent: 20 });
});

test("re-opening a completed lesson does not demote it", () => {
  // The player posts IN_PROGRESS and one card's worth of progress on the first
  // advance of a return visit. Before this rule that wiped the completion.
  const write = forwardOnlyProgress(
    { status: "COMPLETED", completionPercent: 100 },
    { status: "IN_PROGRESS", completionPercent: 8 },
  );
  assert.equal(write.status, undefined);
  assert.equal(write.completionPercent, 100);
});

test("a completed lesson can still be re-completed", () => {
  const write = forwardOnlyProgress(
    { status: "COMPLETED", completionPercent: 100 },
    { status: "COMPLETED", completionPercent: 100 },
  );
  assert.equal(write.status, "COMPLETED");
});

test("an in-progress lesson can be completed", () => {
  const write = forwardOnlyProgress(
    { status: "IN_PROGRESS", completionPercent: 60 },
    { status: "COMPLETED", completionPercent: 100 },
  );
  assert.deepEqual(write, { status: "COMPLETED", completionPercent: 100 });
});

test("the percentage never goes backwards", () => {
  const write = forwardOnlyProgress(
    { status: "IN_PROGRESS", completionPercent: 75 },
    { completionPercent: 10 },
  );
  assert.equal(write.completionPercent, 75);
});

test("a percentage that moves forward is kept", () => {
  const write = forwardOnlyProgress(
    { status: "IN_PROGRESS", completionPercent: 75 },
    { completionPercent: 90 },
  );
  assert.equal(write.completionPercent, 90);
});

test("fields the patch omits are left alone", () => {
  const write = forwardOnlyProgress(
    { status: "IN_PROGRESS", completionPercent: 40 },
    {},
  );
  assert.deepEqual(write, {});
});

test("the player's checkpoint write keeps the practice history", () => {
  // `practice` belongs to the practice exit and carries both the mastery
  // history (best of the last three attempts) and the attempt ids the result
  // page uses to avoid re-emitting LESSON_COMPLETED on a refresh.
  const stored = {
    visited: ["a"],
    checks: { a: { attempts: 1, correct: true } },
    practice: [{ attemptId: "att-1", percentage: 80, passed: true, at: "now" }],
  };
  const write = forwardOnlyProgress(
    { status: "COMPLETED", completionPercent: 100, checkpointData: stored },
    { checkpointData: { visited: ["a", "b"], checks: {} } },
  );
  assert.deepEqual(write.checkpointData, {
    visited: ["a", "b"],
    checks: {},
    practice: stored.practice,
  });
});

// ── Practice history ────────────────────────────────────────

const attempt = (attemptId: string, percentage: number) => ({
  attemptId,
  percentage,
  passed: percentage >= 60,
  at: `2026-08-27T00:00:0${percentage % 10}Z`,
});

test("a new attempt is appended to the history", () => {
  const history = withPracticeRecord([attempt("a", 40)], attempt("b", 80));
  assert.deepEqual(
    history.map((p) => p.attemptId),
    ["a", "b"],
  );
});

test("recording the same attempt twice does not duplicate it", () => {
  // The history feeds best-of-the-last-three. A duplicate crowds out the two
  // attempts before it and inflates the mastery score off one good run.
  const first = withPracticeRecord([attempt("a", 40)], attempt("b", 90));
  const again = withPracticeRecord(first, attempt("b", 90));
  assert.deepEqual(
    again.map((p) => p.attemptId),
    ["a", "b"],
  );
});

test("a re-record keeps the entry stored at submit time", () => {
  const stored = [attempt("b", 90)];
  const again = withPracticeRecord(stored, { ...attempt("b", 10), at: "later" });
  assert.deepEqual(again, stored);
});

test("an empty history starts with the attempt being recorded", () => {
  assert.deepEqual(withPracticeRecord(undefined, attempt("a", 70)), [
    attempt("a", 70),
  ]);
});

test("the stored history is never mutated in place", () => {
  const stored = [attempt("a", 40)];
  withPracticeRecord(stored, attempt("b", 80));
  assert.equal(stored.length, 1);
});

test("merging replaces rather than guesses when either side is not an object", () => {
  assert.deepEqual(mergeCheckpointData(null, { visited: [] }), { visited: [] });
  assert.deepEqual(mergeCheckpointData({ visited: ["a"] }, ["b"]), ["b"]);
  assert.equal(mergeCheckpointData({ visited: ["a"] }, "junk"), "junk");
});
