import type { Difficulty } from "@/types/prisma";
import {
  ageInDays,
  isRapidGuess,
  recencyWeight,
  responseOutcome,
  responseWeight,
} from "./evidence";

// Learning Evidence Layer — the ledger fold.
// See docs/superpowers/specs/2026-08-11-learning-evidence-layer-design.md

export type LearningEventKind =
  | "QUESTION_ANSWERED"
  | "QUIZ_ABANDONED"
  | "LESSON_BLOCK_COMPLETED"
  | "LESSON_COMPLETED"
  | "CARD_REVIEWED"
  | "PRETEST_PASSED";

/** One ledger row, narrowed to what the fold reads. */
export type FoldEvent = {
  seq: bigint;
  topicId: string;
  kind: LearningEventKind;
  correct: boolean | null;
  score: number | null;
  difficulty: Difficulty | null;
  seconds: number | null;
  occurredAt: Date;
};

/** Decayed sufficient statistics for one evidence channel. */
export type ChannelStats = { outcome: number; mass: number };

export type TopicAggregate = {
  topicId: string;
  subjectId: string;
  acc: ChannelStats;
  lesson: ChannelStats;
  srs: ChannelStats;
  /** The instant the stored sums are decayed to. */
  decayAnchor: Date;
  /** Highest ledger sequence already folded in. */
  cursorSeq: bigint;
  /** Latest genuine-effort event — drives the retention curve. */
  lastEffortAt: Date | null;
};

const EFFORT_KINDS: ReadonlySet<LearningEventKind> = new Set([
  "QUESTION_ANSWERED",
  "LESSON_BLOCK_COMPLETED",
  "LESSON_COMPLETED",
  "CARD_REVIEWED",
  "PRETEST_PASSED",
]);

export function emptyAggregate(
  topicId: string,
  subjectId: string,
  at: Date,
): TopicAggregate {
  return {
    topicId,
    subjectId,
    acc: { outcome: 0, mass: 0 },
    lesson: { outcome: 0, mass: 0 },
    srs: { outcome: 0, mass: 0 },
    decayAnchor: at,
    // BigInt(0) rather than 0n: tsconfig targets ES2017, which rejects
    // bigint literals (TS2737). The call form is equivalent and portable.
    cursorSeq: BigInt(0),
    lastEffortAt: null,
  };
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function scale(channel: ChannelStats, factor: number): ChannelStats {
  return { outcome: channel.outcome * factor, mass: channel.mass * factor };
}

/**
 * Carries the stored sums forward to `to`.
 *
 * Exact, not approximate: because wᵢ = 2^(−(t − tᵢ)/H) is multiplicative in t,
 *   S(t₂) = S(t₁) · 2^(−(t₂ − t₁)/H)
 * so a single factor moves the whole aggregate. This is the property the
 * running aggregate is built on.
 */
export function decayTo(aggregate: TopicAggregate, to: Date): TopicAggregate {
  const factor = recencyWeight(ageInDays(aggregate.decayAnchor, to));
  return {
    ...aggregate,
    acc: scale(aggregate.acc, factor),
    lesson: scale(aggregate.lesson, factor),
    srs: scale(aggregate.srs, factor),
    decayAnchor: to,
  };
}

type Contribution = {
  channel: "acc" | "lesson" | "srs";
  weight: number;
  outcome: number;
};

function contributionOf(event: FoldEvent, now: Date): Contribution | null {
  const age = ageInDays(event.occurredAt, now);
  switch (event.kind) {
    case "QUESTION_ANSWERED":
      if (event.correct === null) return null;
      return {
        channel: "acc",
        weight: responseWeight(age, event.seconds),
        outcome: responseOutcome(event.correct, event.difficulty),
      };
    case "LESSON_COMPLETED":
    case "LESSON_BLOCK_COMPLETED":
      if (event.score === null) return null;
      return { channel: "lesson", weight: recencyWeight(age), outcome: clamp01(event.score) };
    case "CARD_REVIEWED":
      if (event.score === null) return null;
      return { channel: "srs", weight: recencyWeight(age), outcome: clamp01(event.score) };
    default:
      // QUIZ_ABANDONED and PRETEST_PASSED are recorded but carry no channel
      // evidence — they say something about engagement and unlocking, not
      // about how well the topic is known.
      return null;
  }
}

/** A rapid guess is a click, not study — it must not reset the retention clock. */
function isEffort(event: FoldEvent): boolean {
  if (!EFFORT_KINDS.has(event.kind)) return false;
  if (event.kind === "QUESTION_ANSWERED" && isRapidGuess(event.seconds)) return false;
  return true;
}

/**
 * Folds ledger events into an aggregate, carrying the existing sums forward to
 * `now` first. Events at or below `base.cursorSeq` are skipped, which makes the
 * fold idempotent and order-independent: replaying the same batch changes
 * nothing, and a dropped write is picked up by the next read.
 */
export function foldEvents(
  base: TopicAggregate,
  events: readonly FoldEvent[],
  now: Date,
): TopicAggregate {
  const carried = decayTo(base, now);
  const channels = {
    acc: { ...carried.acc },
    lesson: { ...carried.lesson },
    srs: { ...carried.srs },
  };
  let cursorSeq = carried.cursorSeq;
  let lastEffortAt = carried.lastEffortAt;

  for (const event of events) {
    // Compare against the ORIGINAL cursor, not the running one, so unsorted
    // input cannot cause an event to be skipped.
    if (event.seq <= base.cursorSeq) continue;
    if (event.seq > cursorSeq) cursorSeq = event.seq;

    if (isEffort(event) && (!lastEffortAt || event.occurredAt > lastEffortAt)) {
      lastEffortAt = event.occurredAt;
    }

    const contribution = contributionOf(event, now);
    if (!contribution) continue;
    const channel = channels[contribution.channel];
    channel.outcome += contribution.weight * contribution.outcome;
    channel.mass += contribution.weight;
  }

  return { ...carried, ...channels, cursorSeq, lastEffortAt };
}
