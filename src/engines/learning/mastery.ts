import type { MasteryLevel } from "@/types/prisma";
import { masteryLevelFromScore } from "@/lib/lesson-engine";
import { retentionAt } from "@/lib/spaced-repetition";
import type { KnowledgeGraph } from "./graph";
import { channelScore, PRIOR_STRENGTH } from "./evidence";
import type { TopicAggregate, ChannelStats } from "./fold";
import {
  loadFoldedAggregates,
  persistAggregates,
  type MasteryStoreClient,
} from "@/lib/topic-mastery-store";

// Learning Path Engine — composite per-topic mastery, the retention curve,
// and the derived topic state layer (algorithm A).
// See docs/superpowers/specs/2026-08-02-learning-path-engine-design.md

const DAY_MS = 86_400_000;

/**
 * The three evidence components that feed a topic's composite mastery, plus
 * the latest study timestamp that drives retention decay.
 *
 * - acc    0..100 practice accuracy across completed assessment attempts
 * - lessonM 0..100 average lesson mastery (StudentProgress.masteryScore)
 * - srs    0..1   average predicted retention of scheduled flashcards
 */
export interface TopicEvidence {
  acc: number | null;
  lessonM: number | null;
  srs: number | null;
  lastStudy: Date | null;
}

export interface TopicState extends TopicEvidence {
  topicId: string;
  /** Composite 0..100 — reweighted sum of the present evidence components. */
  mastery: number;
  level: MasteryLevel;
  /** Predicted probability the topic is recallable now (0..1), or null if untouched. */
  retention: number | null;
  /** Memory strength in days, derived from the mastery level. */
  stability: number;
  /**
   * How much of `mastery` comes from data rather than the prior (0..1).
   * Below CONFIDENCE_FLOOR the number is not worth showing or diagnosing.
   */
  confidence: number;
}

export type TopicStateMap = Map<string, TopicState>;

const ACC_WEIGHT = 0.45;
const LESSON_WEIGHT = 0.35;
const SRS_WEIGHT = 0.2;

/** Stability (memory half-life, days) seeded by mastery level (algorithm A). */
export const STABILITY_BY_LEVEL: Record<MasteryLevel, number> = {
  WEAK: 5,
  DEVELOPING: 14,
  COMPETENT: 30,
  STRONG: 60,
};

export function stabilityForLevel(level: MasteryLevel): number {
  return STABILITY_BY_LEVEL[level];
}

/**
 * Composite mastery with reweighting: missing evidence never zeroes a topic —
 * the surviving components renormalise to 100% of the weight.
 */
export function compositeMastery(
  evidence: Pick<TopicEvidence, "acc" | "lessonM" | "srs">,
): number {
  const present: Array<[number, number]> = [];
  if (evidence.acc != null) present.push([ACC_WEIGHT, evidence.acc]);
  if (evidence.lessonM != null) present.push([LESSON_WEIGHT, evidence.lessonM]);
  if (evidence.srs != null) present.push([SRS_WEIGHT, evidence.srs * 100]);
  if (present.length === 0) return 0;

  const weightSum = present.reduce((sum, [weight]) => sum + weight, 0);
  const score = present.reduce(
    (sum, [weight, component]) => sum + (weight / weightSum) * component,
    0,
  );
  return Math.min(100, Math.max(0, Math.round(score)));
}

/** Predicted topic retention now: R(t) = (1 + 19/81 · t/S)^-0.5 (shared with SRS). */
export function topicRetention(
  lastStudy: Date | null,
  stability: number,
  now: Date,
): number | null {
  if (!lastStudy) return null;
  const days = Math.max(0, (now.getTime() - lastStudy.getTime()) / DAY_MS);
  return retentionAt(days, stability);
}

/** Pure assembly: evidence → full topic state. */
export function assembleTopicState(
  topicId: string,
  evidence: TopicEvidence,
  now = new Date(),
): TopicState {
  const mastery = compositeMastery(evidence);
  const level = masteryLevelFromScore(mastery);
  const stability = stabilityForLevel(level);
  const retention = topicRetention(evidence.lastStudy, stability, now);
  return { topicId, ...evidence, mastery, level, stability, retention, confidence: 0 };
}

/**
 * Derives the state layer for every node in the graph by folding the learning
 * event ledger.
 *
 * The per-topic aggregate carries the decayed sufficient statistics forward in
 * closed form, so only events past its cursor are read — usually none. The
 * folded result is written back opportunistically; that write is a cache
 * refresh, not a source of truth, so its failure costs a recomputation and
 * nothing else.
 */
export async function computeTopicState(
  prisma: MasteryStoreClient,
  studentId: string,
  graph: KnowledgeGraph,
  now = new Date(),
): Promise<TopicStateMap> {
  if (graph.nodes.size === 0) return new Map();

  const topics = new Map<string, string>();
  for (const [topicId, node] of graph.nodes) {
    topics.set(topicId, node.subjectId);
  }

  const { aggregates, changed } = await loadFoldedAggregates(
    prisma,
    studentId,
    topics,
    now,
  );

  const state: TopicStateMap = new Map();
  for (const [topicId, aggregate] of aggregates) {
    state.set(topicId, scoreAggregate(aggregate, now));
  }

  // Only topics that folded a new event are worth writing back. A read that
  // changed nothing writes nothing — otherwise every dashboard render, every
  // classroom page and every lesson access check would await N upserts of
  // identical numbers.
  if (changed.size > 0) {
    await persistAggregates(
      prisma,
      studentId,
      [...changed].map((topicId) => aggregates.get(topicId) as TopicAggregate),
    );
  }

  return state;
}

/**
 * Composite mastery from the three channels.
 *
 * Each channel's base weight is multiplied by that channel's own confidence,
 * then renormalised over the channels that have any evidence at all — so a
 * topic with heavy practice and one flaky flashcard leans on the practice
 * automatically. With a single channel present the confidence factor cancels,
 * and mastery is exactly that channel's shrunk score.
 */
export function scoreAggregate(
  aggregate: TopicAggregate,
  now: Date,
): TopicState {
  const acc = channelScore(aggregate.acc.outcome, aggregate.acc.mass);
  const lesson = channelScore(aggregate.lesson.outcome, aggregate.lesson.mass);
  const srs = channelScore(aggregate.srs.outcome, aggregate.srs.mass);

  const present: Array<[number, number]> = [];
  const consider = (
    stats: ChannelStats,
    baseWeight: number,
    scored: { score: number; confidence: number },
  ) => {
    if (stats.mass > 0) present.push([baseWeight * scored.confidence, scored.score]);
  };
  consider(aggregate.acc, ACC_WEIGHT, acc);
  consider(aggregate.lesson, LESSON_WEIGHT, lesson);
  consider(aggregate.srs, SRS_WEIGHT, srs);

  const weightSum = present.reduce((sum, [weight]) => sum + weight, 0);
  const composite =
    weightSum > 0
      ? present.reduce((sum, [weight, score]) => sum + (weight / weightSum) * score, 0)
      : 0;
  const mastery = Math.min(100, Math.max(0, Math.round(composite * 100)));

  // Confidence is NOT an average of the channel confidences — averaging would
  // let an empty channel drag down a well-evidenced topic. Evidence from
  // different channels accumulates.
  const totalMass = aggregate.acc.mass + aggregate.lesson.mass + aggregate.srs.mass;
  const confidence = totalMass / (totalMass + PRIOR_STRENGTH);

  const level = masteryLevelFromScore(mastery);
  const stability = stabilityForLevel(level);

  return {
    topicId: aggregate.topicId,
    acc: aggregate.acc.mass > 0 ? acc.score * 100 : null,
    lessonM: aggregate.lesson.mass > 0 ? lesson.score * 100 : null,
    srs: aggregate.srs.mass > 0 ? srs.score : null,
    lastStudy: aggregate.lastEffortAt,
    mastery,
    level,
    stability,
    retention: topicRetention(aggregate.lastEffortAt, stability, now),
    confidence,
  };
}
