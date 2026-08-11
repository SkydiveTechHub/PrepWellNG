import type { PrismaClient } from "@prisma/client";
import type { MasteryLevel } from "@/types/prisma";
import { masteryLevelFromScore } from "@/lib/lesson-engine";
import { retentionAt } from "@/lib/spaced-repetition";
import type { KnowledgeGraph } from "./graph";
import { channelScore, PRIOR_STRENGTH } from "./evidence";
import type { TopicAggregate, ChannelStats } from "./fold";

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
 * Derives the state layer for every node in the graph from live evidence:
 * completed assessment responses (accuracy), completed-lesson mastery scores,
 * and scheduled flashcard reviews (SRS retention). Pure on-demand read — it
 * never writes rows; the numbers recompute from the source tables each call.
 */
export async function computeTopicState(
  prisma: Pick<
    PrismaClient,
    "questionResponse" | "studentProgress" | "flashcardReview"
  >,
  studentId: string,
  graph: KnowledgeGraph,
  now = new Date(),
): Promise<TopicStateMap> {
  const topicIds = [...graph.nodes.keys()];
  if (topicIds.length === 0) return new Map();

  const [responses, progress, reviews] = await Promise.all([
    prisma.questionResponse.findMany({
      where: {
        attempt: { studentId, status: "COMPLETED" },
        question: { topicId: { in: topicIds } },
      },
      select: {
        isCorrect: true,
        attempt: { select: { completedAt: true, startedAt: true } },
        question: { select: { topicId: true } },
      },
    }),
    prisma.studentProgress.findMany({
      where: {
        studentId,
        topicId: { in: topicIds },
        lessonId: { not: null },
        masteryScore: { not: null },
      },
      select: { topicId: true, masteryScore: true, lastAccessedAt: true },
    }),
    prisma.flashcardReview.findMany({
      where: {
        studentId,
        state: { in: ["REVIEW", "RELEARNING"] },
        lastReviewedAt: { not: null },
        flashcard: {
          deck: {
            OR: [
              { topicId: { in: topicIds } },
              { lesson: { subtopic: { topicId: { in: topicIds } } } },
            ],
          },
        },
      },
      select: {
        stability: true,
        lastReviewedAt: true,
        flashcard: {
          select: {
            deck: {
              select: {
                topicId: true,
                lesson: { select: { subtopic: { select: { topicId: true } } } },
              },
            },
          },
        },
      },
    }),
  ]);

  // Practice accuracy + latest attempt time, per topic.
  const accByTopic = new Map<
    string,
    { correct: number; total: number; last: number }
  >();
  for (const response of responses) {
    const topicId = response.question.topicId;
    if (!topicId) continue;
    const entry = accByTopic.get(topicId) ?? { correct: 0, total: 0, last: 0 };
    entry.total += 1;
    if (response.isCorrect) entry.correct += 1;
    const at = (response.attempt.completedAt ?? response.attempt.startedAt).getTime();
    if (at > entry.last) entry.last = at;
    accByTopic.set(topicId, entry);
  }

  // Average lesson mastery + latest access time, per topic.
  const lessonByTopic = new Map<
    string,
    { sum: number; count: number; last: number }
  >();
  for (const row of progress) {
    const topicId = row.topicId;
    if (!topicId || row.masteryScore == null) continue;
    const entry =
      lessonByTopic.get(topicId) ?? { sum: 0, count: 0, last: 0 };
    entry.sum += row.masteryScore;
    entry.count += 1;
    if (row.lastAccessedAt) {
      const at = row.lastAccessedAt.getTime();
      if (at > entry.last) entry.last = at;
    }
    lessonByTopic.set(topicId, entry);
  }

  // Average predicted SRS retention + latest review time, per topic.
  const srsByTopic = new Map<string, { sum: number; count: number; last: number }>();
  for (const review of reviews) {
    const deck = review.flashcard.deck;
    const topicId = deck.topicId ?? deck.lesson?.subtopic.topicId ?? null;
    if (!topicId) continue;
    const entry = srsByTopic.get(topicId) ?? { sum: 0, count: 0, last: 0 };
    entry.sum += retentionAt(
      Math.max(0, (now.getTime() - (review.lastReviewedAt as Date).getTime()) / DAY_MS),
      review.stability,
    );
    entry.count += 1;
    const at = (review.lastReviewedAt as Date).getTime();
    if (at > entry.last) entry.last = at;
    srsByTopic.set(topicId, entry);
  }

  const state: TopicStateMap = new Map();
  for (const topicId of topicIds) {
    const accEntry = accByTopic.get(topicId);
    const lessonEntry = lessonByTopic.get(topicId);
    const srsEntry = srsByTopic.get(topicId);

    const acc = accEntry ? (accEntry.correct / accEntry.total) * 100 : null;
    const lessonM = lessonEntry ? lessonEntry.sum / lessonEntry.count : null;
    const srs = srsEntry ? srsEntry.sum / srsEntry.count : null;

    const lastStudy = Math.max(
      accEntry?.last ?? 0,
      lessonEntry?.last ?? 0,
      srsEntry?.last ?? 0,
    );

    state.set(
      topicId,
      assembleTopicState(topicId, {
        acc,
        lessonM,
        srs,
        lastStudy: lastStudy > 0 ? new Date(lastStudy) : null,
      }, now),
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
