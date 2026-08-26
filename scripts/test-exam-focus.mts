import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AWAY_FLOOR_MS,
  countsAsAway,
  nextAwayCount,
  sanitiseAwayCount,
} from "../src/components/assessment/exam-focus";

const HIDDEN_AT = 1_770_000_000_000;

test("the away floor is three seconds", () => {
  assert.equal(AWAY_FLOOR_MS, 3000);
});

test("an absence longer than the floor counts", () => {
  assert.equal(countsAsAway(HIDDEN_AT, HIDDEN_AT + 3001), true);
});

test("an absence shorter than the floor does not count", () => {
  assert.equal(countsAsAway(HIDDEN_AT, HIDDEN_AT + 2999), false);
});

test("an absence exactly at the floor does not count", () => {
  assert.equal(countsAsAway(HIDDEN_AT, HIDDEN_AT + AWAY_FLOOR_MS), false);
});

test("a return with no recorded departure does not count", () => {
  assert.equal(countsAsAway(null, HIDDEN_AT + 9000), false);
});

test("a clock that jumped backwards does not count", () => {
  assert.equal(countsAsAway(HIDDEN_AT, HIDDEN_AT - 5000), false);
});

test("a counted absence increments the running total", () => {
  assert.equal(nextAwayCount(4, HIDDEN_AT, HIDDEN_AT + 5000), 5);
});

test("an uncounted absence leaves the running total alone", () => {
  assert.equal(nextAwayCount(4, HIDDEN_AT, HIDDEN_AT + 1000), 4);
});

test("a stored count survives a resume", () => {
  assert.equal(sanitiseAwayCount(7), 7);
});

test("a session stored before this field existed reads as zero", () => {
  assert.equal(sanitiseAwayCount(undefined), 0);
});

test("a corrupt stored count reads as zero", () => {
  assert.equal(sanitiseAwayCount("many"), 0);
  assert.equal(sanitiseAwayCount(-3), 0);
  assert.equal(sanitiseAwayCount(Number.NaN), 0);
  assert.equal(sanitiseAwayCount(2.7), 2);
});
