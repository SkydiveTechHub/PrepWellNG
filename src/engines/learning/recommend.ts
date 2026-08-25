import type { KnowledgeGraph, GraphNode } from "./graph";
import { incomingEdges, outgoingEdges } from "./graph";
import { isAvailable, TARGET } from "./availability";
import type { TopicState, TopicStateMap } from "./mastery";

// Learning Path Engine — next-topic recommendation (algorithm C).
// See docs/superpowers/specs/2026-08-02-learning-path-engine-design.md

const DAY_MS = 86_400_000;

export const STRONG_MASTERY = 85;
export const DECAY_RETENTION = 0.85;
export const WEAK_MASTERY = 50;
export const GAP_RETENTION = 0.8;

const URGENCY_W = 0.3;
const LEVERAGE_W = 0.3;
const DECAY_W = 0.2;
const READINESS_W = 0.1;
const FRESHNESS_W = 0.1;

/** Combined WAEC + JAMB weight — a topic counts once per exam it serves. */
export function examWeight(node: GraphNode): number {
  return node.waecWeight + node.jambWeight;
}

/** Direct dependents (outgoing edges) whose mastery is still below TARGET. */
export function unmasteredDependents(
  state: TopicStateMap,
  graph: KnowledgeGraph,
  topicId: string,
): GraphNode[] {
  return outgoingEdges(graph, topicId)
    .map((edge) => graph.nodes.get(edge.to))
    .filter((node): node is GraphNode => node !== undefined)
    .filter((node) => (state.get(node.id)?.mastery ?? 0) < TARGET);
}

export interface RecommendationFactors {
  urgency: number;
  leverage: number;
  decay: number;
  readiness: number;
  freshness: number;
}

export interface NextTopicRecommendation {
  topicId: string;
  subjectId: string;
  title: string;
  slug: string;
  mastery: number;
  score: number;
  reason: string;
  factors: RecommendationFactors;
  /** Number of unmastered dependent topics this unlocks. */
  unlocks: number;
  /** Evidence behind `mastery`, for deciding whether to show it at all. */
  confidence: number;
  accObservations: number;
  lessonObservations: number;
  srsObservations: number;
  /** ISO string — see EvidenceCounts.lastStudy in lib/evidence-display.ts. */
  lastStudy: string | null;
}

/** The reason line carried by a pick that came from the student's own lessons. */
export const CONTINUE_REASON = "Continue where you left off";

export interface RecommendOptions {
  k?: number;
  now?: Date;
  pretestPassed?: ReadonlySet<string>;
  /** Topic ids to leave out — already picked by a rail upstream. */
  exclude?: ReadonlySet<string>;
  /**
   * Skip topics with no observations in any channel. Their mastery is the
   * untouched prior rather than a measurement, so recommending one states
   * something about the student that nothing has established.
   */
  evidenceOnly?: boolean;
}

/** Whether any channel has actually observed this topic. */
export function hasEvidence(topic: TopicState): boolean {
  return (
    topic.accObservations + topic.lessonObservations + topic.srsObservations > 0
  );
}

interface Ranked {
  score: number;
  factors: RecommendationFactors;
  unlocks: number;
}

function rankCandidate(
  topicId: string,
  state: TopicStateMap,
  graph: KnowledgeGraph,
  now: Date,
): Ranked {
  const mastery = state.get(topicId)?.mastery ?? 0;

  const urgency = Math.min(1, Math.max(0, (TARGET - mastery) / TARGET));

  const dependents = outgoingEdges(graph, topicId)
    .map((edge) => graph.nodes.get(edge.to))
    .filter((node): node is GraphNode => node !== undefined);
  const unmastered = dependents.filter(
    (node) => (state.get(node.id)?.mastery ?? 0) < TARGET,
  );
  const totalWeight = dependents.reduce(
    (sum, node) => sum + examWeight(node),
    0,
  );
  const unmasteredWeight = unmastered.reduce(
    (sum, node) => sum + examWeight(node),
    0,
  );
  const leverage = totalWeight > 0 ? unmasteredWeight / totalWeight : 0;

  const retention = state.get(topicId)?.retention ?? null;
  const decay = retention != null ? Math.max(0, DECAY_RETENTION - retention) : 0;

  const prereqEdges = incomingEdges(graph, topicId).filter(
    (edge) => edge.kind === "PREREQUISITE",
  );
  const allPrereqsStrong = prereqEdges.every(
    (edge) => (state.get(edge.from)?.mastery ?? 0) >= STRONG_MASTERY,
  );
  const readiness = allPrereqsStrong ? 1 : prereqEdges.length === 0 ? 1 : 0.5;

  const lastStudy = state.get(topicId)?.lastStudy ?? null;
  const freshness =
    lastStudy && now.getTime() - lastStudy.getTime() < DAY_MS ? 0.5 : 1;

  const factors: RecommendationFactors = {
    urgency,
    leverage,
    decay,
    readiness,
    freshness,
  };
  const score =
    URGENCY_W * urgency +
    LEVERAGE_W * leverage +
    DECAY_W * decay +
    READINESS_W * readiness +
    FRESHNESS_W * freshness;

  return { score, factors, unlocks: unmastered.length };
}

function reasonFor(
  node: GraphNode,
  mastery: number,
  factors: RecommendationFactors,
  unlocks: number,
): string {
  if (factors.leverage >= 0.25 && unlocks >= 1) {
    return `Unlocks ${unlocks} topic${unlocks === 1 ? "" : "s"}`;
  }
  if (factors.urgency >= 0.4) {
    const weight = Math.round(examWeight(node));
    return weight > 0
      ? `High-yield — ${weight} exam weight, ${Math.round(mastery)}% mastery`
      : "Next in your learning path";
  }
  if (factors.decay >= 0.1) {
    return "Fading — revise while fresh";
  }
  return "Next in your learning path";
}

function toRecommendation(
  topicId: string,
  state: TopicStateMap,
  graph: KnowledgeGraph,
  ranked: Ranked,
  reason: string,
): NextTopicRecommendation {
  const node = graph.nodes.get(topicId);
  const topic = state.get(topicId);
  return {
    topicId,
    subjectId: node?.subjectId ?? "",
    title: node?.title ?? topicId,
    slug: node?.slug ?? "",
    mastery: topic?.mastery ?? 0,
    score: ranked.score,
    reason,
    factors: ranked.factors,
    unlocks: ranked.unlocks,
    confidence: topic?.confidence ?? 0,
    accObservations: topic?.accObservations ?? 0,
    lessonObservations: topic?.lessonObservations ?? 0,
    srsObservations: topic?.srsObservations ?? 0,
    lastStudy: topic?.lastStudy?.toISOString() ?? null,
  };
}

/**
 * Consolidation fallback when no topic is both available and unmastered:
 * mastered topics whose predicted retention has faded below the target.
 * A Phase-3 stand-in for the revision queue (algorithm E, Phase 4).
 */
function masteredButDecayed(
  state: TopicStateMap,
  graph: KnowledgeGraph,
  k: number,
  exclude: ReadonlySet<string> = new Set<string>(),
): NextTopicRecommendation[] {
  const picks: Array<{ rec: NextTopicRecommendation; retention: number; weight: number }> = [];
  for (const [topicId, topic] of state) {
    const node = graph.nodes.get(topicId);
    if (!node) continue;
    if (exclude.has(topicId)) continue;
    if (topic.mastery < TARGET) continue;
    if (topic.retention == null || topic.retention >= DECAY_RETENTION) continue;
    picks.push({
      rec: {
        topicId,
        subjectId: node.subjectId,
        title: node.title,
        slug: node.slug,
        mastery: topic.mastery,
        score: (DECAY_RETENTION - topic.retention) * examWeight(node),
        reason: "Consolidate — retention fading",
        factors: {
          urgency: 0,
          leverage: 0,
          decay: DECAY_RETENTION - topic.retention,
          readiness: 1,
          freshness: 1,
        },
        unlocks: 0,
        confidence: topic.confidence,
        accObservations: topic.accObservations,
        lessonObservations: topic.lessonObservations,
        srsObservations: topic.srsObservations,
        lastStudy: topic.lastStudy?.toISOString() ?? null,
      },
      retention: topic.retention,
      weight: examWeight(node),
    });
  }
  picks.sort(
    (a, b) =>
      b.rec.score - a.rec.score ||
      b.retention - a.retention ||
      b.weight - a.weight,
  );
  return picks.slice(0, k).map((pick) => pick.rec);
}

/**
 * Top-k topics to study next: available, below mastery TARGET, ranked by
 * urgency + downstream leverage + decay + readiness + freshness, each with a
 * one-line human reason. Falls back to retention consolidation when nothing
 * is available to learn.
 */
export function recommendNext(
  state: TopicStateMap,
  graph: KnowledgeGraph,
  options: RecommendOptions = {},
): NextTopicRecommendation[] {
  const k = options.k ?? 3;
  const now = options.now ?? new Date();
  const pretestPassed = options.pretestPassed ?? new Set<string>();
  const exclude = options.exclude ?? new Set<string>();

  const candidates: NextTopicRecommendation[] = [];
  for (const [topicId, topic] of state) {
    const node = graph.nodes.get(topicId);
    if (!node) continue;
    if (exclude.has(topicId)) continue;
    if (options.evidenceOnly && !hasEvidence(topic)) continue;
    if (!isAvailable(topicId, state, graph, pretestPassed)) continue;
    if (topic.mastery >= TARGET) continue;
    const ranked = rankCandidate(topicId, state, graph, now);
    candidates.push(
      toRecommendation(
        topicId,
        state,
        graph,
        ranked,
        reasonFor(node, topic.mastery, ranked.factors, ranked.unlocks),
      ),
    );
  }

  if (candidates.length > 0) {
    candidates.sort((a, b) => b.score - a.score);
    return candidates.slice(0, k);
  }
  return masteredButDecayed(state, graph, k, exclude);
}

/**
 * Topics behind the student's most recent lessons that are still short of
 * TARGET, newest first and one card per topic.
 *
 * These bypass `isAvailable`: the student has already been inside the lesson,
 * so a readiness gate saying they cannot reach it would be arguing with
 * something that already happened.
 */
function recentLessonPicks(
  recentLessonTopicIds: readonly string[],
  state: TopicStateMap,
  graph: KnowledgeGraph,
  now: Date,
  k: number,
): NextTopicRecommendation[] {
  const picks: NextTopicRecommendation[] = [];
  const seen = new Set<string>();
  for (const topicId of recentLessonTopicIds) {
    if (picks.length >= k) break;
    if (seen.has(topicId)) continue;
    seen.add(topicId);
    const topic = state.get(topicId);
    if (!topic || !graph.nodes.has(topicId)) continue;
    if (topic.mastery >= TARGET) continue;
    picks.push(
      toRecommendation(
        topicId,
        state,
        graph,
        rankCandidate(topicId, state, graph, now),
        CONTINUE_REASON,
      ),
    );
  }
  return picks;
}

/**
 * What the dashboard's "Keep learning" rail shows: the topics behind the
 * student's last k lessons that they have not mastered yet, topped up with
 * ranked recommendations when fewer than k of those qualify.
 *
 * The top-up is restricted to topics the student has actually touched
 * (`evidenceOnly`). Ranked across the whole catalog the engine will happily
 * surface a topic with no observations at all — its mastery is the untouched
 * prior, so it reads as maximally urgent — and the card then asserts a topic
 * and subject the student has never met. A short rail beats a confident guess.
 */
export function keepLearning(
  state: TopicStateMap,
  graph: KnowledgeGraph,
  recentLessonTopicIds: readonly string[],
  options: RecommendOptions = {},
): NextTopicRecommendation[] {
  const k = options.k ?? 3;
  const now = options.now ?? new Date();
  const picks = recentLessonPicks(recentLessonTopicIds, state, graph, now, k);
  if (picks.length >= k) return picks;

  const exclude = new Set([
    ...(options.exclude ?? []),
    ...picks.map((pick) => pick.topicId),
  ]);
  return [
    ...picks,
    ...recommendNext(state, graph, {
      ...options,
      k: k - picks.length,
      now,
      exclude,
      evidenceOnly: true,
    }),
  ];
}
