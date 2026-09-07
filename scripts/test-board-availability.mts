import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SURFACE_BARS,
  assessBoard,
  assessBoards,
} from "../src/lib/board-availability";

test("a board with nothing loaded is shut, and says so", () => {
  const status = assessBoard("PAST_QUESTIONS", "NECO", []);
  assert.equal(status.ready, false);
  assert.equal(status.qualifying, 0);
  assert.equal(status.reason, "No NECO questions loaded yet");
});

test("papers on offer count even where we hold no questions", () => {
  // The whole point of the past-questions bar: an uncached paper is fetched on
  // the way into the quiz, so one listed paper is a subject that works.
  const status = assessBoard("PAST_QUESTIONS", "WAEC", [1, 1, 1, 1]);
  assert.equal(status.ready, true);
  assert.equal(status.reason, null);
});

test("breadth is the bar, not depth", () => {
  // Two thousand questions in one subject serve almost nobody: a candidate
  // registers eight or nine.
  const deep = assessBoard("PAST_QUESTIONS", "WAEC", [2000]);
  assert.equal(deep.ready, false);
  assert.equal(deep.reason, "1 of 4 WAEC subjects ready");
});

test("the mock exam ignores subjects short of a usable paper", () => {
  const bar = SURFACE_BARS.MOCK_EXAM;
  const status = assessBoard("MOCK_EXAM", "WAEC", [
    bar.minPerSubject,
    bar.minPerSubject - 1,
    bar.minPerSubject - 1,
  ]);
  assert.equal(status.qualifying, 1);
  assert.equal(status.started, 3);
  assert.equal(status.ready, false);
});

test("a board part-way there is distinguished from one not started", () => {
  const none = assessBoard("MOCK_EXAM", "NECO", []);
  const thin = assessBoard("MOCK_EXAM", "NECO", [5, 5]);
  assert.equal(none.reason, "No NECO questions loaded yet");
  assert.equal(
    thin.reason,
    "NECO subjects are still short of a full syllabus-tagged question set",
  );
});

test("the bar is exactly met, not merely approached", () => {
  const bar = SURFACE_BARS.MOCK_EXAM;
  const counts = Array.from({ length: bar.minSubjects }, () => bar.minPerSubject);
  assert.equal(assessBoard("MOCK_EXAM", "JAMB", counts).ready, true);
  counts[0] -= 1;
  assert.equal(assessBoard("MOCK_EXAM", "JAMB", counts).ready, false);
});

test("boards are assessed independently of one another", () => {
  const statuses = assessBoards("PAST_QUESTIONS", {
    JAMB: [40, 40, 40, 40, 40],
    WAEC: [20],
    NECO: [],
  });
  assert.equal(statuses.JAMB.ready, true);
  assert.equal(statuses.WAEC.ready, false);
  assert.equal(statuses.NECO.ready, false);
});
