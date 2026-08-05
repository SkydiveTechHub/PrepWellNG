import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SUBMIT_GRACE_SECONDS,
  deadlineFor,
  evaluateAttemptTiming,
} from "../src/lib/attempt-timing";

const START = new Date("2026-08-04T09:00:00.000Z");

function at(secondsAfterStart: number): Date {
  return new Date(START.getTime() + secondsAfterStart * 1000);
}

// ─── deadlineFor ───────────────────────────────────────────

test("deadlineFor adds the limit to the start time", () => {
  assert.deepEqual(
    deadlineFor(START, 60),
    new Date("2026-08-04T10:00:00.000Z"),
  );
});

test("deadlineFor returns null for an untimed assessment", () => {
  assert.equal(deadlineFor(START, null), null);
  assert.equal(deadlineFor(START, undefined), null);
  assert.equal(deadlineFor(START, 0), null);
});

// ─── clamping client-reported time ─────────────────────────

test("an honest report is kept as-is", () => {
  const timing = evaluateAttemptTiming({
    startedAt: START,
    timeLimitMinutes: 60,
    reportedSeconds: 1500,
    now: at(1600),
  });
  assert.equal(timing.timeSpentSeconds, 1500);
  assert.equal(timing.exceededLimit, false);
});

test("a report larger than the elapsed wall time is clamped", () => {
  // Client claims 10 minutes but only 2 minutes have actually passed.
  const timing = evaluateAttemptTiming({
    startedAt: START,
    timeLimitMinutes: 60,
    reportedSeconds: 600,
    now: at(120),
  });
  assert.equal(timing.timeSpentSeconds, 120);
});

test("a report larger than the time limit is clamped to the limit", () => {
  // Tab left open for five hours on a one-hour paper.
  const timing = evaluateAttemptTiming({
    startedAt: START,
    timeLimitMinutes: 60,
    reportedSeconds: 18_000,
    now: at(18_000),
  });
  assert.equal(timing.timeSpentSeconds, 3600);
});

test("a negative or non-finite report becomes zero", () => {
  for (const reportedSeconds of [-50, NaN, Infinity]) {
    const timing = evaluateAttemptTiming({
      startedAt: START,
      timeLimitMinutes: 60,
      reportedSeconds,
      now: at(300),
    });
    assert.equal(timing.timeSpentSeconds, 0, `reported=${reportedSeconds}`);
  }
});

test("an untimed assessment clamps only to elapsed time", () => {
  const timing = evaluateAttemptTiming({
    startedAt: START,
    timeLimitMinutes: null,
    reportedSeconds: 99_999,
    now: at(500),
  });
  assert.equal(timing.allowedSeconds, null);
  assert.equal(timing.timeSpentSeconds, 500);
  assert.equal(timing.exceededLimit, false);
});

// ─── the grace period ──────────────────────────────────────

test("submitting exactly at the deadline is on time", () => {
  const timing = evaluateAttemptTiming({
    startedAt: START,
    timeLimitMinutes: 60,
    reportedSeconds: 3600,
    now: at(3600),
  });
  assert.equal(timing.exceededLimit, false);
});

test("a slow network inside the grace window is not penalised", () => {
  const timing = evaluateAttemptTiming({
    startedAt: START,
    timeLimitMinutes: 60,
    reportedSeconds: 3600,
    now: at(3600 + SUBMIT_GRACE_SECONDS),
  });
  assert.equal(timing.exceededLimit, false);
});

test("beyond the grace window the overrun is flagged", () => {
  const timing = evaluateAttemptTiming({
    startedAt: START,
    timeLimitMinutes: 60,
    reportedSeconds: 3600,
    now: at(3600 + SUBMIT_GRACE_SECONDS + 1),
  });
  assert.equal(timing.exceededLimit, true);
  // Flagged, but the work is still graded and the recorded time stays sane.
  assert.equal(timing.timeSpentSeconds, 3600);
});

test("the grace window is configurable", () => {
  const timing = evaluateAttemptTiming({
    startedAt: START,
    timeLimitMinutes: 60,
    reportedSeconds: 3600,
    now: at(3610),
    graceSeconds: 5,
  });
  assert.equal(timing.exceededLimit, true);
});

// ─── clock skew ────────────────────────────────────────────

test("a submission timestamped before the start yields zero elapsed", () => {
  const timing = evaluateAttemptTiming({
    startedAt: START,
    timeLimitMinutes: 60,
    reportedSeconds: 900,
    now: at(-300),
  });
  assert.equal(timing.elapsedSeconds, 0);
  assert.equal(timing.timeSpentSeconds, 0);
  assert.equal(timing.exceededLimit, false);
});

test("timing exposes the server-computed deadline", () => {
  const timing = evaluateAttemptTiming({
    startedAt: START,
    timeLimitMinutes: 30,
    reportedSeconds: 0,
    now: at(10),
  });
  assert.deepEqual(timing.deadlineAt, new Date("2026-08-04T09:30:00.000Z"));
});
