import type { PrismaClient } from "@prisma/client";
import type { KnowledgeGraph } from "./graph";
import {
  examWeight,
  unmasteredDependents,
  DECAY_RETENTION,
  type NextTopicRecommendation,
} from "./recommend";
import type { TopicState, TopicStateMap } from "./mastery";

// Learning Path Engine — merged revision queue (algorithm E).
// See docs/superpowers/specs/2026-08-02-learning-path-engine-design.md
//
// One surface, two inputs: the fixed [1,3,7,14]-day cadence rows written by
// the lesson engine (StudentProgress.revisionDueAt) and the per-card SRS
// schedule from lib/spaced-repetition.ts (aggregated per topic). Nothing here
// is stored — the queue recomputes from live evidence each read.

/** Retention at or above this is "fresh enough"; below it a topic is due. */
export const REVISION_RETENTION = DECAY_RETENTION;

/** Per-topic revision evidence gathered from the DB, separate from mastery. */
export interface RevisionExtras {
  /** Earliest fixed-cadence due date across the topic's progress rows, or null. */
  cadenceDueAt: Date | null;
  /** Number of REVIEW/RELEARNING flashcards due for this topic right now. */
  dueSrsCards: number;
}

export type RevisionExtrasMap = Map<string, RevisionExtras>;

export interface RevisionQueueItem {
  topicId: string;
  subjectId: string;
  title: string;
  slug: string;
  mastery: number;
  retention: number | null;
  /** Merged priority: decay × exam weight × downstream-blocked multiplier. */
  priority: number;
  /** One-line human reason, shown on the card. */
  reason: string;
  /** Number of directly blocked (still-unmastered) dependent topics. */
  blockedCount: number;
  dueSrsCards: number;
  cadenceDue: boolean;
}

/**
 * Algorithm E, first clause: is this topic due for revision?
 * Retention faded below target, OR a fixed-cadence pass is due, OR the topic's
 * flashcard SRS queue has cards to review.
 */
export function isRevisionDue(
  topic: TopicState,
  extras: RevisionExtras,
  now: Date,
): boolean {
  if (topic.retention != null && topic.retention < REVISION_RETENTION) {
    return true;
  }
  if (extras.cadenceDueAt && extras.cadenceDueAt.getTime() <= now.getTime()) {
    return true;
  }
  if (extras.dueSrsCards > 0) return true;
  return false;
}

/**
 * Algorithm E, second clause. `maxBlocked` is the largest blockedCount across
 * the graph, used to normalise the downstream multiplier into a 1..2 factor.
 * A topic that never got retention evidence is treated as fresh (decay 0).
 */
export function revisionPriority(
  topicId: string,
  state: TopicStateMap,
  graph: KnowledgeGraph,
  extras: RevisionExtras,
  maxBlocked: number,
): number {
  const node = graph.nodes.get(topicId);
  const topic = state.get(topicId);
  if (!node || !topic) return 0;

  const retention = topic.retention ?? REVISION_RETENTION;
  const decay = Math.max(0, REVISION_RETENTION - retention);
  const blocked = unmasteredDependents(state, graph, topicId).length;
  const blockedFactor = 1 + (maxBlocked > 0 ? blocked / maxBlocked : 0);
  return decay * examWeight(node) * blockedFactor;
}

function reasonFor(
  topic: TopicState,
  extras: RevisionExtras,
): string {
  if (topic.retention != null && topic.retention < REVISION_RETENTION) {
    return `Retention ${Math.round(topic.retention * 100)}% — re-cement it`;
  }
  if (extras.dueSrsCards > 0) {
    return `${extras.dueSrsCards} card${extras.dueSrsCards === 1 ? "" : "s"} due for review`;
  }
  return "Scheduled revision is due";
}

/**
 * The merged revision queue: every studied topic that is due, ranked by
 * priority (decay × exam weight × blocked multiplier), then by the size of
 * its SRS queue. Pure — the caller supplies the derived state + DB extras.
 */
export function revisionQueue(
  state: TopicStateMap,
  graph: KnowledgeGraph,
  extras: RevisionExtrasMap,
  options: { now?: Date; k?: number; maxBlocked?: number } = {},
): RevisionQueueItem[] {
  const now = options.now ?? new Date();
  const k = options.k ?? Infinity;

  let maxBlocked = options.maxBlocked;
  if (maxBlocked == null) {
    maxBlocked = 0;
    for (const id of graph.nodes.keys()) {
      maxBlocked = Math.max(
        maxBlocked,
        unmasteredDependents(state, graph, id).length,
      );
    }
  }

  const items: RevisionQueueItem[] = [];
  for (const [topicId, topic] of state) {
    const node = graph.nodes.get(topicId);
    if (!node) continue;
    if (topic.lastStudy == null) continue;
    const topicExtras = extras.get(topicId) ?? {
      cadenceDueAt: null,
      dueSrsCards: 0,
    };
    if (!isRevisionDue(topic, topicExtras, now)) continue;

    items.push({
      topicId,
      subjectId: node.subjectId,
      title: node.title,
      slug: node.slug,
      mastery: topic.mastery,
      retention: topic.retention,
      priority: revisionPriority(topicId, state, graph, topicExtras, maxBlocked),
      reason: reasonFor(topic, topicExtras),
      blockedCount: unmasteredDependents(state, graph, topicId).length,
      dueSrsCards: topicExtras.dueSrsCards,
      cadenceDue:
        topicExtras.cadenceDueAt != null &&
        topicExtras.cadenceDueAt.getTime() <= now.getTime(),
    });
  }

  items.sort(
    (a, b) =>
      b.priority - a.priority ||
      b.dueSrsCards - a.dueSrsCards ||
      (b.retention ?? 1) - (a.retention ?? 1),
  );
  return items.slice(0, Number.isFinite(k) ? k : items.length);
}

/**
 * Loads the DB half of the queue: the earliest fixed-cadence revisionDueAt per
 * topic (StudentProgress rows) and the count of due REVIEW/RELEARNING
 * flashcards per topic. The mastery half (retention) comes from computeTopicState.
 */
export async function loadRevisionExtras(
  prisma: Pick<PrismaClient, "studentProgress" | "flashcardReview">,
  studentId: string,
  graph: KnowledgeGraph,
  now = new Date(),
): Promise<RevisionExtrasMap> {
  const topicIds = [...graph.nodes.keys()];
  const extras: RevisionExtrasMap = new Map();
  if (topicIds.length === 0) return extras;

  const [progressRows, reviews] = await Promise.all([
    prisma.studentProgress.findMany({
      where: { studentId, topicId: { in: topicIds }, revisionDueAt: { not: null } },
      select: { topicId: true, revisionDueAt: true },
    }),
    prisma.flashcardReview.findMany({
      where: {
        studentId,
        state: { in: ["REVIEW", "RELEARNING"] },
        dueAt: { lte: now },
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

  const minDueAt = new Map<string, Date>();
  for (const row of progressRows) {
    if (!row.topicId || !row.revisionDueAt) continue;
    const at = row.revisionDueAt.getTime();
    const existing = minDueAt.get(row.topicId);
    if (!existing || at < existing.getTime()) minDueAt.set(row.topicId, row.revisionDueAt);
  }

  const dueCount = new Map<string, number>();
  for (const review of reviews) {
    const deck = review.flashcard.deck;
    const topicId = deck.topicId ?? deck.lesson?.subtopic.topicId ?? null;
    if (!topicId) continue;
    dueCount.set(topicId, (dueCount.get(topicId) ?? 0) + 1);
  }

  for (const topicId of topicIds) {
    extras.set(topicId, {
      cadenceDueAt: minDueAt.get(topicId) ?? null,
      dueSrsCards: dueCount.get(topicId) ?? 0,
    });
  }
  return extras;
}

/**
 * Presents a revision item through the same shape the "Keep learning" rail
 * renders, so an empty recommendation list can hand off to the queue.
 */
export function revisionItemToRecommendation(
  item: RevisionQueueItem,
): NextTopicRecommendation {
  const retention = item.retention ?? REVISION_RETENTION;
  return {
    topicId: item.topicId,
    subjectId: item.subjectId,
    title: item.title,
    slug: item.slug,
    mastery: item.mastery,
    score: item.priority,
    reason: item.reason,
    factors: {
      urgency: 0,
      leverage: 0,
      decay: Math.max(0, REVISION_RETENTION - retention),
      readiness: 1,
      freshness: 1,
    },
    unlocks: item.blockedCount,
    // RevisionQueueItem carries no per-channel evidence counts; these items
    // already have an established mastery figure (mastered, then decayed),
    // so present as fully confident rather than thinly measured.
    confidence: 1,
    accObservations: 0,
    lessonObservations: 0,
    srsObservations: 0,
  };
}
