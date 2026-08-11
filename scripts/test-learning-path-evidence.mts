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

// ═══════════════════════════════════════════════════════════
// The event fold
// ═══════════════════════════════════════════════════════════

import {
  emptyAggregate,
  foldEvents,
  decayTo,
  type FoldEvent,
  type TopicAggregate,
} from "../src/engines/learning/fold";

let seqCounter = 0n;

function event(overrides: Partial<FoldEvent> = {}): FoldEvent {
  seqCounter += 1n;
  return {
    seq: seqCounter,
    topicId: "t1",
    kind: "QUESTION_ANSWERED",
    correct: true,
    score: null,
    difficulty: "INTERMEDIATE",
    seconds: 30,
    occurredAt: now,
    ...overrides,
  };
}

function daysBefore(days: number, from: Date = now): Date {
  return new Date(from.getTime() - days * DAY_MS);
}

const base = () => emptyAggregate("t1", "subj-1", now);

// ─── Channel routing ───────────────────────────────────────

test("foldEvents: an answered question lands in the practice channel", () => {
  const folded = foldEvents(base(), [event({ correct: true })], now);
  close(folded.acc.mass, 1);
  close(folded.acc.outcome, 1);
  close(folded.lesson.mass, 0);
  close(folded.srs.mass, 0);
});

test("foldEvents: lesson events land in the lesson channel, cards in the SRS channel", () => {
  const folded = foldEvents(
    base(),
    [
      event({ kind: "LESSON_COMPLETED", correct: null, score: 0.8 }),
      event({ kind: "LESSON_BLOCK_COMPLETED", correct: null, score: 0.6 }),
      event({ kind: "CARD_REVIEWED", correct: null, score: 0.85 }),
    ],
    now,
  );
  close(folded.lesson.mass, 2);
  close(folded.lesson.outcome, 1.4);
  close(folded.srs.mass, 1);
  close(folded.srs.outcome, 0.85);
  close(folded.acc.mass, 0);
});

test("foldEvents: events carrying no channel evidence contribute no mass", () => {
  const folded = foldEvents(
    base(),
    [
      event({ kind: "PRETEST_PASSED", correct: null, score: null }),
      event({ kind: "QUIZ_ABANDONED", correct: null, score: null }),
    ],
    now,
  );
  close(folded.acc.mass, 0);
  close(folded.lesson.mass, 0);
  close(folded.srs.mass, 0);
});

test("foldEvents: an out-of-range lesson score is clamped to 0..1", () => {
  const folded = foldEvents(
    base(),
    [event({ kind: "LESSON_COMPLETED", correct: null, score: 1.4 })],
    now,
  );
  close(folded.lesson.outcome, 1);
});

// ─── Decay ─────────────────────────────────────────────────

test("foldEvents: an older answer carries less weight than a fresh one", () => {
  const fresh = foldEvents(base(), [event({ occurredAt: now })], now);
  const old = foldEvents(base(), [event({ occurredAt: daysBefore(45) })], now);
  close(old.acc.mass, fresh.acc.mass * 0.5);
});

test("decayTo: carrying forward a half-life halves both sums", () => {
  const folded = foldEvents(base(), [event()], now);
  const later = decayTo(folded, new Date(now.getTime() + 45 * DAY_MS));
  close(later.acc.mass, folded.acc.mass * 0.5);
  close(later.acc.outcome, folded.acc.outcome * 0.5);
});

test("decayTo: carrying backwards is a no-op, never an amplification", () => {
  const folded = foldEvents(base(), [event()], now);
  const earlier = decayTo(folded, daysBefore(10));
  close(earlier.acc.mass, folded.acc.mass);
});

// ─── The cursor ────────────────────────────────────────────

test("foldEvents: events at or below the cursor are already folded", () => {
  const once = foldEvents(base(), [event({ seq: 100n })], now);
  const twice = foldEvents(once, [{ ...event({ seq: 100n }) }], now);
  close(twice.acc.mass, once.acc.mass);
});

test("foldEvents: the cursor advances to the highest sequence seen", () => {
  const folded = foldEvents(base(), [event({ seq: 7n }), event({ seq: 41n })], now);
  assert.equal(folded.cursorSeq, 41n);
});

test("foldEvents: out-of-order input folds the same as sorted input", () => {
  const a = event({ seq: 10n, occurredAt: daysBefore(5) });
  const b = event({ seq: 20n, occurredAt: daysBefore(1) });
  const sorted = foldEvents(base(), [a, b], now);
  const shuffled = foldEvents(base(), [b, a], now);
  close(shuffled.acc.mass, sorted.acc.mass);
  close(shuffled.acc.outcome, sorted.acc.outcome);
  assert.equal(shuffled.cursorSeq, sorted.cursorSeq);
});

// ─── Effort timestamp ──────────────────────────────────────

test("foldEvents: lastEffortAt tracks the latest genuine-effort event", () => {
  const folded = foldEvents(
    base(),
    [
      event({ occurredAt: daysBefore(10) }),
      event({ kind: "CARD_REVIEWED", correct: null, score: 0.9, occurredAt: daysBefore(2) }),
      event({ occurredAt: daysBefore(30) }),
    ],
    now,
  );
  assert.equal(folded.lastEffortAt?.getTime(), daysBefore(2).getTime());
});

test("foldEvents: a rapid guess is not effort and does not reset the clock", () => {
  const folded = foldEvents(
    base(),
    [
      event({ occurredAt: daysBefore(10), seconds: 30 }),
      event({ occurredAt: daysBefore(1), seconds: 1 }),
    ],
    now,
  );
  assert.equal(folded.lastEffortAt?.getTime(), daysBefore(10).getTime());
});

test("foldEvents: an abandoned quiz is not effort", () => {
  const folded = foldEvents(
    base(),
    [event({ kind: "QUIZ_ABANDONED", correct: null, score: null })],
    now,
  );
  assert.equal(folded.lastEffortAt, null);
});

test("foldEvents: PRETEST_PASSED advances the effort clock despite carrying no evidence", () => {
  const folded = foldEvents(
    base(),
    [event({ kind: "PRETEST_PASSED", correct: null, score: null, occurredAt: daysBefore(3) })],
    now,
  );
  assert.equal(folded.lastEffortAt?.getTime(), daysBefore(3).getTime());
  close(folded.acc.mass, 0);
  close(folded.lesson.mass, 0);
  close(folded.srs.mass, 0);
});

test("foldEvents: lesson completion advances the effort clock", () => {
  const folded = foldEvents(
    base(),
    [event({ kind: "LESSON_COMPLETED", correct: null, score: 0.8, occurredAt: daysBefore(4) })],
    now,
  );
  assert.equal(folded.lastEffortAt?.getTime(), daysBefore(4).getTime());
});

// ─── The central invariant ─────────────────────────────────

test("foldEvents: incremental catch-up equals a full replay, at every split", () => {
  const kinds = [
    { kind: "QUESTION_ANSWERED" as const, correct: true, score: null },
    { kind: "QUESTION_ANSWERED" as const, correct: false, score: null },
    { kind: "LESSON_COMPLETED" as const, correct: null, score: 0.7 },
    { kind: "CARD_REVIEWED" as const, correct: null, score: 0.9 },
  ];
  const difficulties = ["BASIC", "INTERMEDIATE", "ADVANCED", null] as const;

  // A deterministic pseudo-random sequence — reproducible on failure.
  let rng = 12345;
  const next = () => (rng = (rng * 1103515245 + 12345) % 2147483648) / 2147483648;

  for (let trial = 0; trial < 50; trial += 1) {
    const count = 5 + Math.floor(next() * 20);
    const events: FoldEvent[] = [];
    for (let i = 0; i < count; i += 1) {
      const shape = kinds[Math.floor(next() * kinds.length)];
      events.push({
        seq: BigInt(i + 1),
        topicId: "t1",
        kind: shape.kind,
        correct: shape.correct,
        score: shape.score,
        difficulty: difficulties[Math.floor(next() * difficulties.length)],
        seconds: next() < 0.2 ? 1 : 30,
        // 120 days back up to 10 days back, ascending with i.
        occurredAt: daysBefore(120 - i * (110 / count)),
      });
    }

    const t1 = daysBefore(5);
    const t2 = now;
    const splitAt = 1 + Math.floor(next() * (events.length - 1));
    const before = events.slice(0, splitAt);
    const after = events.slice(splitAt);

    const full = foldEvents(emptyAggregate("t1", "subj-1", t1), events, t2);
    const incremental = foldEvents(
      foldEvents(emptyAggregate("t1", "subj-1", t1), before, t1),
      after,
      t2,
    );

    const message = `trial ${trial}, split ${splitAt}`;
    close(incremental.acc.mass, full.acc.mass, 1e-9);
    close(incremental.acc.outcome, full.acc.outcome, 1e-9);
    close(incremental.lesson.mass, full.lesson.mass, 1e-9);
    close(incremental.lesson.outcome, full.lesson.outcome, 1e-9);
    close(incremental.srs.mass, full.srs.mass, 1e-9);
    close(incremental.srs.outcome, full.srs.outcome, 1e-9);
    assert.equal(incremental.cursorSeq, full.cursorSeq, message);
    assert.equal(
      incremental.lastEffortAt?.getTime() ?? null,
      full.lastEffortAt?.getTime() ?? null,
      message,
    );
  }
});

import { scoreAggregate } from "../src/engines/learning/mastery";

function scored(events: FoldEvent[], at: Date = now) {
  return scoreAggregate(foldEvents(emptyAggregate("t1", "subj-1", at), events, at), at);
}

// ─── Aggregate → TopicState ────────────────────────────────

test("scoreAggregate: the four worked cases from the spec", () => {
  assert.equal(scored([event({ correct: true })]).mastery, 56);
  assert.equal(scored([event({ correct: false })]).mastery, 39);

  const ten = (correct: boolean) =>
    Array.from({ length: 10 }, () => event({ correct }));
  assert.equal(scored(ten(true)).mastery, 84);
  assert.equal(scored(ten(false)).mastery, 24);
});

test("scoreAggregate: one correct answer leaves the topic below TARGET", () => {
  assert.ok(scored([event({ correct: true })]).mastery < 70);
});

test("scoreAggregate: ten wrong answers are firmly weak, with the evidence to say so", () => {
  const state = scored(Array.from({ length: 10 }, () => event({ correct: false })));
  assert.ok(state.mastery < 50);
  assert.ok(state.confidence > 0.35);
});

test("scoreAggregate: one wrong answer is below the confidence floor", () => {
  assert.ok(scored([event({ correct: false })]).confidence < 0.35);
});

test("scoreAggregate: a single channel scores exactly its own shrunk value", () => {
  // With one channel present the confidence weighting cancels in the
  // renormalisation, so mastery is the channel score unmodified.
  const state = scored([event({ correct: true })]);
  close(state.mastery / 100, channelScore(1, 1).score, 0.005);
});

test("scoreAggregate: no evidence yields zero mastery and zero confidence", () => {
  const state = scored([]);
  assert.equal(state.mastery, 0);
  assert.equal(state.confidence, 0);
  assert.equal(state.acc, null);
  assert.equal(state.lessonM, null);
  assert.equal(state.srs, null);
});

test("scoreAggregate: channels with no evidence stay null so hasEvidence still works", () => {
  const state = scored([event({ correct: true })]);
  assert.ok(state.acc !== null);
  assert.equal(state.lessonM, null);
  assert.equal(state.srs, null);
});

test("scoreAggregate: confidence accumulates across channels rather than averaging", () => {
  const practiceOnly = scored(Array.from({ length: 4 }, () => event({ correct: true })));
  const both = scored([
    ...Array.from({ length: 4 }, () => event({ correct: true })),
    event({ kind: "CARD_REVIEWED", correct: null, score: 0.9 }),
  ]);
  assert.ok(
    both.confidence > practiceOnly.confidence,
    "adding a second channel must raise confidence, not dilute it",
  );
});

test("scoreAggregate: the better-evidenced channel dominates the composite", () => {
  const state = scored([
    ...Array.from({ length: 20 }, () => event({ correct: true })),
    event({ kind: "CARD_REVIEWED", correct: null, score: 0.0 }),
  ]);
  // Twenty correct answers against one bad card: practice must win.
  // 80, not 70: the confidence-weighted composite gives 86 while the unweighted
  // one gives 74, so a threshold of 70 would pass even with the confidence
  // weighting removed from scoreAggregate. This bound pins the behaviour.
  assert.ok(state.mastery > 80, `expected practice to dominate, got ${state.mastery}`);
});

test("scoreAggregate: retention derives from lastEffortAt, not from lesson access", () => {
  const state = scored([event({ occurredAt: daysBefore(1) })]);
  assert.ok(state.retention !== null);
  assert.equal(state.lastStudy?.getTime(), daysBefore(1).getTime());

  const untouched = scored([event({ kind: "QUIZ_ABANDONED", correct: null, score: null })]);
  assert.equal(untouched.retention, null);
  assert.equal(untouched.lastStudy, null);
});

test("scoreAggregate: mastery maps onto the existing level bands", () => {
  const strong = scored(Array.from({ length: 60 }, () => event({ correct: true })));
  assert.equal(strong.level, "STRONG");
  assert.equal(strong.stability, 60);
});
