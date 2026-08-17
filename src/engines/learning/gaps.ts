import type { KnowledgeGraph, GraphNode } from "./graph";
import { outgoingEdges } from "./graph";
import { isAvailable } from "./availability";
import {
  examWeight,
  unmasteredDependents,
  WEAK_MASTERY,
  GAP_RETENTION,
} from "./recommend";
import type { TopicStateMap, TopicState } from "./mastery";
import { CONFIDENCE_FLOOR, OBSERVATION_FLOOR, ABANDONED_FLOOR } from "./evidence";

// Learning Path Engine — learning-gap detection (algorithm D).
// See docs/superpowers/specs/2026-08-02-learning-path-engine-design.md

export type GapCategory = "WEAK" | "DECAYED" | "BOTTLENECK" | "ABANDONED" | "UNTOUCHED";

export interface TopicGap {
  topicId: string;
  subjectId: string;
  title: string;
  slug: string;
  category: GapCategory;
  mastery: number;
  retention: number | null;
  /** Sum of exam weight over every reachable dependent — the graph multiplier. */
  bottleneckScore: number;
  /** Number of direct dependents still below mastery TARGET. */
  blockedCount: number;
  /** Evidence behind `mastery`, for deciding whether to show it at all. */
  confidence: number;
  accObservations: number;
  lessonObservations: number;
  srsObservations: number;
  /**
   * How many times this topic appeared in a quiz the student started and never
   * finished. Explains a gap; deliberately does not rank it.
   */
  abandonedCount: number;
}

/** All nodes reachable from `topicId` (transitive closure over the DAG). */
export function descendants(
  graph: KnowledgeGraph,
  topicId: string,
): string[] {
  const seen = new Set<string>();
  const stack = [topicId];
  while (stack.length > 0) {
    const id = stack.pop() as string;
    for (const edge of outgoingEdges(graph, id)) {
      if (!graph.nodes.has(edge.to)) continue;
      if (seen.has(edge.to)) continue;
      seen.add(edge.to);
      stack.push(edge.to);
    }
  }
  return [...seen];
}

/**
 * A weak foundation topic is worth more than its own marks: fixing it pays
 * for every downstream topic it gates. Weighted by exam weight.
 */
export function bottleneckScore(
  graph: KnowledgeGraph,
  topicId: string,
): number {
  return descendants(graph, topicId).reduce(
    (sum, id) => sum + examWeight(graph.nodes.get(id) as GraphNode),
    0,
  );
}

/**
 * Classifies a topic's gap status. WEAK dominates, then DECAYED; UNTOUCHED
 * is informational (an available, never-started topic — surfaced by the
 * recommendations instead of the gap queue).
 *
 * Diagnosed gaps (WEAK/DECAYED/BOTTLENECK) require evidence: a topic the
 * student has never touched (no lesson, practice or SRS data) has zero
 * mastery, but it is not a weakness — it is simply not started yet.
 *
 * ABANDONED is the one exception: a topic with no other evidence but at
 * least `ABANDONED_FLOOR` abandoned-quiz appearances is still a gap — the
 * student opened a mock on it and bailed, repeatedly. It only ever rescues
 * the no-evidence case; a topic that already has evidence keeps whatever
 * classification that evidence earns it.
 */
export function classifyTopic(
  state: TopicStateMap,
  graph: KnowledgeGraph,
  topicId: string,
  pretestPassed: ReadonlySet<string> = new Set(),
  abandonedByTopic: ReadonlyMap<string, number> = new Map(),
): GapCategory | null {
  const topic = state.get(topicId);
  if (!topic || !graph.nodes.has(topicId)) return null;

  const hasEvidence = topic.acc != null || topic.lessonM != null || topic.srs != null;
  if (!hasEvidence) {
    if ((abandonedByTopic.get(topicId) ?? 0) >= ABANDONED_FLOOR) return "ABANDONED";
    return isAvailable(topicId, state, graph, pretestPassed) ? "UNTOUCHED" : null;
  }

  // Enough evidence, not merely some — but "enough" means different things
  // for the two evidenced categories, because confidence and observation
  // count diverge as evidence ages.
  //
  // WEAK asks "is this topic weak?" — a question about how well we know it
  // right now — so it gates on `confidence`, which decays with age. A topic
  // scored from one fresh answer has a mastery figure, but acting on it would
  // diagnose a weakness from noise; below the floor we withhold judgement.
  //
  // DECAYED asks "did this student once know it and lose it?" — a question
  // about how much evidence was ever gathered, not about how fresh it is. It
  // gates on raw `observations` instead, which do not decay. Gating it on
  // confidence would make it chase `retention`: both fall with age, so a
  // topic could become DECAYED and then silently stop being DECAYED purely by
  // getting staler — exactly the case DECAYED exists to catch.
  //
  // BOTTLENECK is deliberately NOT gated: it asserts something about the graph
  // and about other topics' mastery, not about how well we know this one.
  const confident = topic.confidence >= CONFIDENCE_FLOOR;
  const observations =
    topic.accObservations + topic.lessonObservations + topic.srsObservations;
  const measured = observations >= OBSERVATION_FLOOR;

  if (confident && topic.mastery < WEAK_MASTERY) return "WEAK";
  if (measured && topic.retention != null && topic.retention < GAP_RETENTION) {
    return "DECAYED";
  }
  const blocked = unmasteredDependents(state, graph, topicId);
  if (!isAvailable(topicId, state, graph, pretestPassed) && blocked.length >= 2) {
    return "BOTTLENECK";
  }
  return null;
}

/**
 * The gap queue: WEAK ∪ DECAYED ∪ BOTTLENECK ∪ ABANDONED, ranked by
 * bottleneck score (descending) then mastery (ascending) — the
 * highest-leverage fix wins.
 *
 * ABANDONED sorts into its own bottom tier ahead of that rule: an
 * unevidenced topic has `mastery` 0 and `bottleneckScore` 0, so under the
 * plain comparator it would sort *ahead* of every other score-0 gap and
 * crowd out topics we have actually measured. Abandonment explains a gap, it
 * does not rank it — WEAK/DECAYED/BOTTLENECK keep their existing relative
 * order.
 */
export function gapQueue(
  state: TopicStateMap,
  graph: KnowledgeGraph,
  pretestPassed: ReadonlySet<string> = new Set(),
  abandonedByTopic: ReadonlyMap<string, number> = new Map(),
): TopicGap[] {
  const gaps: TopicGap[] = [];
  for (const [topicId] of state) {
    const category = classifyTopic(state, graph, topicId, pretestPassed, abandonedByTopic);
    if (
      category !== "WEAK" &&
      category !== "DECAYED" &&
      category !== "BOTTLENECK" &&
      category !== "ABANDONED"
    ) {
      continue;
    }
    const node = graph.nodes.get(topicId);
    if (!node) continue;
    const topic = state.get(topicId) as TopicState;
    gaps.push({
      topicId,
      subjectId: node.subjectId,
      title: node.title,
      slug: node.slug,
      category,
      mastery: topic.mastery,
      retention: topic.retention,
      bottleneckScore: bottleneckScore(graph, topicId),
      blockedCount: unmasteredDependents(state, graph, topicId).length,
      confidence: topic.confidence,
      accObservations: topic.accObservations,
      lessonObservations: topic.lessonObservations,
      srsObservations: topic.srsObservations,
      abandonedCount: abandonedByTopic.get(topicId) ?? 0,
    });
  }
  gaps.sort(
    (a, b) =>
      Number(a.category === "ABANDONED") - Number(b.category === "ABANDONED") ||
      b.bottleneckScore - a.bottleneckScore ||
      a.mastery - b.mastery,
  );
  return gaps;
}
