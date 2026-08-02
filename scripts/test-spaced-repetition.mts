import { test } from "node:test";
import assert from "node:assert/strict";
import {
  initialState,
  reviewCard,
  retentionAt,
  predictRetention,
  isDue,
  intervalLabel,
  type ReviewState,
} from "../src/lib/spaced-repetition";

const at = new Date("2026-08-01T09:00:00Z");

test("NEW + GOOD → LEARNING with a short learning step", () => {
  const next = reviewCard(initialState("INTERMEDIATE", at), { rating: "GOOD", reviewedAt: at });
  assert.equal(next.state, "LEARNING");
  assert.equal(next.repetitions, 1);
  assert.ok(next.intervalDays < 1, `expected <1 day, got ${next.intervalDays}`);
  assert.equal(next.lastReviewedAt, at.toISOString());
});

test("NEW + AGAIN → LEARNING with a ~1 minute interval (re-queue)", () => {
  const next = reviewCard(initialState("INTERMEDIATE", at), { rating: "AGAIN", reviewedAt: at });
  assert.equal(next.state, "LEARNING");
  const minutes = next.intervalDays * 1440;
  assert.ok(Math.abs(minutes - 1) < 0.001, `expected ~1 min, got ${minutes} min`);
});

test("NEW + EASY → REVIEW immediately (graduate)", () => {
  const next = reviewCard(initialState("BASIC", at), { rating: "EASY", reviewedAt: at });
  assert.equal(next.state, "REVIEW");
  assert.ok(next.intervalDays >= 1, `expected >=1 day, got ${next.intervalDays}`);
});

test("learning → graduate to REVIEW after two successes", () => {
  let s = reviewCard(initialState("INTERMEDIATE", at), { rating: "GOOD", reviewedAt: at });
  assert.equal(s.state, "LEARNING");
  s = reviewCard(s, { rating: "GOOD", reviewedAt: at });
  assert.equal(s.state, "REVIEW");
  assert.ok(s.intervalDays >= 1, `expected >=1 day, got ${s.intervalDays}`);
});

test("intervals strictly increase on successive success", () => {
  let s = initialState("INTERMEDIATE", at);
  const intervals: number[] = [];
  for (let i = 0; i < 5; i++) {
    s = reviewCard(s, { rating: "GOOD", reviewedAt: at });
    intervals.push(s.intervalDays);
  }
  for (let i = 1; i < intervals.length; i++) {
    assert.ok(
      intervals[i] > intervals[i - 1],
      `interval must strictly increase: ${intervals[i]} <= ${intervals[i - 1]}`,
    );
  }
});

test("REVIEW + AGAIN → lapse → RELEARNING", () => {
  let s = initialState("INTERMEDIATE", at);
  s = reviewCard(s, { rating: "EASY", reviewedAt: at }); // → REVIEW
  assert.equal(s.state, "REVIEW");
  const before = s.lapses;
  const next = reviewCard(s, { rating: "AGAIN", reviewedAt: at });
  assert.equal(next.state, "RELEARNING");
  assert.equal(next.lapses, before + 1);
  assert.equal(next.repetitions, 0);
  const minutes = next.intervalDays * 1440;
  assert.ok(minutes <= 1, `expected ~1 min after lapse, got ${minutes} min`);
});

test("relearning recovers to REVIEW after two successes", () => {
  let s = initialState("INTERMEDIATE", at);
  s = reviewCard(s, { rating: "EASY", reviewedAt: at }); // → REVIEW
  s = reviewCard(s, { rating: "AGAIN", reviewedAt: at }); // → RELEARNING
  assert.equal(s.state, "RELEARNING");
  s = reviewCard(s, { rating: "GOOD", reviewedAt: at });
  assert.equal(s.state, "RELEARNING");
  s = reviewCard(s, { rating: "GOOD", reviewedAt: at });
  assert.equal(s.state, "REVIEW");
});

test("difficulty moves the right way per rating", () => {
  const base = initialState("INTERMEDIATE", at);
  const again = reviewCard(base, { rating: "AGAIN", reviewedAt: at });
  const hard = reviewCard(base, { rating: "HARD", reviewedAt: at });
  const good = reviewCard(base, { rating: "GOOD", reviewedAt: at });
  const easy = reviewCard(base, { rating: "EASY", reviewedAt: at });
  assert.ok(again.difficulty > base.difficulty, "AGAIN must raise difficulty");
  assert.ok(hard.difficulty > base.difficulty, "HARD must raise difficulty");
  assert.equal(good.difficulty, base.difficulty, "GOOD must keep difficulty");
  assert.ok(easy.difficulty < base.difficulty, "EASY must lower difficulty");
});

test("retentionAt decays monotonically", () => {
  const s = 10;
  const r1 = retentionAt(1, s);
  const r2 = retentionAt(5, s);
  const r3 = retentionAt(20, s);
  assert.ok(r1 > r2 && r2 > r3, "R(t) must decrease as time passes");
  assert.ok(r1 <= 1 && r1 > 0.5);
  assert.equal(retentionAt(0, s), 1);
});

test("predictRetention returns 1 with no review history", () => {
  const s: ReviewState = initialState("INTERMEDIATE", at);
  assert.equal(predictRetention(s), 1);
});

test("isDue compares against the stored dueAt", () => {
  const s = reviewCard(initialState("INTERMEDIATE", at), { rating: "EASY", reviewedAt: at });
  const nextDay = new Date(at.getTime() + 86400_000);
  assert.equal(isDue(s, at), false, "not due immediately after scheduling");
  assert.equal(isDue(s, new Date(nextDay.getTime() + 86400_000)), true, "due much later");
});

test("intervalLabel is human-readable", () => {
  assert.equal(intervalLabel(0), "now");
  assert.ok(intervalLabel(1).includes("1d"));
  assert.ok(intervalLabel(0.5).includes("12h"));
});
