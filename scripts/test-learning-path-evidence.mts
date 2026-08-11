import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ageInDays,
  channelScore,
  isRapidGuess,
  recencyWeight,
  responseOutcome,
  responseWeight,
  PRIOR_STRENGTH,
  RECENCY_HALF_LIFE_DAYS,
} from "../src/engines/learning/evidence";

const DAY_MS = 86_400_000;
const now = new Date("2026-08-01T09:00:00Z");

function close(actual: number, expected: number, epsilon = 1e-9) {
  assert.ok(
    Math.abs(actual - expected) < epsilon,
    `expected ${expected}, got ${actual}`,
  );
}

// ─── Outcome by difficulty ─────────────────────────────────

test("responseOutcome: all six cells of the difficulty table", () => {
  assert.equal(responseOutcome(true, "BASIC"), 0.85);
  assert.equal(responseOutcome(false, "BASIC"), 0);
  assert.equal(responseOutcome(true, "INTERMEDIATE"), 1);
  assert.equal(responseOutcome(false, "INTERMEDIATE"), 0.15);
  assert.equal(responseOutcome(true, "ADVANCED"), 1);
  assert.equal(responseOutcome(false, "ADVANCED"), 0.35);
});

test("responseOutcome: an unlabelled question is treated as INTERMEDIATE", () => {
  assert.equal(responseOutcome(true, null), responseOutcome(true, "INTERMEDIATE"));
  assert.equal(responseOutcome(false, null), responseOutcome(false, "INTERMEDIATE"));
});

test("responseOutcome: a correct BASIC answer cannot prove mastery", () => {
  assert.ok(responseOutcome(true, "BASIC") < responseOutcome(true, "ADVANCED"));
});

test("responseOutcome: a wrong ADVANCED answer is not damning", () => {
  assert.ok(responseOutcome(false, "ADVANCED") > responseOutcome(false, "BASIC"));
});

// ─── Recency weight ────────────────────────────────────────

test("recencyWeight: halves every half-life", () => {
  close(recencyWeight(0), 1);
  close(recencyWeight(RECENCY_HALF_LIFE_DAYS), 0.5);
  close(recencyWeight(RECENCY_HALF_LIFE_DAYS * 2), 0.25);
});

test("recencyWeight: a future age clamps to full weight, never above", () => {
  close(recencyWeight(-10), 1);
});

test("ageInDays: measures forward and clamps backwards to zero", () => {
  close(ageInDays(new Date(now.getTime() - 3 * DAY_MS), now), 3);
  close(ageInDays(new Date(now.getTime() + 3 * DAY_MS), now), 0);
});

// ─── Rapid guessing ────────────────────────────────────────

test("isRapidGuess: under three seconds, and unknown timing is not a guess", () => {
  assert.equal(isRapidGuess(2), true);
  assert.equal(isRapidGuess(3), false);
  assert.equal(isRapidGuess(30), false);
  assert.equal(isRapidGuess(null), false);
});

test("responseWeight: a rapid guess is down-weighted, not dropped", () => {
  const considered = responseWeight(0, 30);
  const guessed = responseWeight(0, 1);
  close(guessed, considered * 0.3);
  assert.ok(guessed > 0, "a rapid guess must still carry some weight");
});

// ─── Shrunk channel score ──────────────────────────────────

test("channelScore: the four worked cases from the spec", () => {
  close(channelScore(1.0, 1).score, 0.56);        // 1 correct intermediate  → 56
  close(channelScore(0.15, 1).score, 0.39);       // 1 wrong intermediate    → 39
  close(channelScore(10, 10).score, 11.8 / 14);   // 10/10 intermediate      → 84
  close(channelScore(1.5, 10).score, 3.3 / 14);   // 0/10 intermediate       → 24
});

test("channelScore: no evidence returns the prior exactly", () => {
  close(channelScore(0, 0).score, 0.45);
  close(channelScore(0, 0).confidence, 0);
});

test("channelScore: confidence is the data's share against the prior", () => {
  close(channelScore(1, 1).confidence, 1 / (1 + PRIOR_STRENGTH));
  close(channelScore(10, 10).confidence, 10 / (10 + PRIOR_STRENGTH));
});

test("channelScore: confidence rises monotonically with evidence mass", () => {
  let previous = -1;
  for (const mass of [0, 1, 2, 5, 10, 50, 200]) {
    const { confidence } = channelScore(mass, mass);
    assert.ok(confidence > previous, `confidence fell at mass ${mass}`);
    assert.ok(confidence < 1, "confidence must never reach certainty");
    previous = confidence;
  }
});

test("channelScore: a single answer cannot reach the extremes", () => {
  assert.ok(channelScore(1, 1).score < 0.7, "one correct answer must not master a topic");
  assert.ok(channelScore(0, 1).score > 0.3, "one wrong answer must not zero a topic");
});
