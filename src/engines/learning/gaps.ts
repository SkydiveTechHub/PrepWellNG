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
import { CONFIDENCE_FLOOR } from "./evidence";

// Learning Path Engine — learning-gap detection (algorithm D).
// See docs/superpowers/specs/2026-08-02-learning-path-engine-design.md

export type GapCategory = "WEAK" | "DECAYED" | "BOTTLENECK" | "UNTOUCHED";

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
 */
export function classifyTopic(
  state: TopicStateMap,
  graph: KnowledgeGraph,
  topicId: string,
  pretestPassed: ReadonlySet<string> = new Set(),
): GapCategory | null {
  const topic = state.get(topicId);
  if (!topic || !graph.nodes.has(topicId)) return null;

  const hasEvidence = topic.acc != null || topic.lessonM != null || topic.srs != null;
  if (!hasEvidence) {
    return isAvailable(topicId, state, graph, pretestPassed) ? "UNTOUCHED" : null;
  }

  // Enough evidence, not merely some. A topic scored from one answer has a
  // mastery figure, but acting on it would diagnose a weakness from noise.
  // Below the floor we withhold judgement rather than guess — the topic is
  // neither a gap nor untouched, it is simply not yet measured.
  //
  // BOTTLENECK is deliberately NOT gated: it asserts something about the graph
  // and about other topics' mastery, not about how well we know this one.
  const confident = topic.confidence >= CONFIDENCE_FLOOR;

  if (confident && topic.mastery < WEAK_MASTERY) return "WEAK";
  if (confident && topic.retention != null && topic.retention < GAP_RETENTION) {
    return "DECAYED";
  }
  const blocked = unmasteredDependents(state, graph, topicId);
  if (!isAvailable(topicId, state, graph, pretestPassed) && blocked.length >= 2) {
    return "BOTTLENECK";
  }
  return null;
}

/**
 * The gap queue: WEAK ∪ DECAYED ∪ BOTTLENECK, ranked by bottleneck score
 * (descending) then mastery (ascending) — the highest-leverage fix wins.
 */
export function gapQueue(
  state: TopicStateMap,
  graph: KnowledgeGraph,
  pretestPassed: ReadonlySet<string> = new Set(),
): TopicGap[] {
  const gaps: TopicGap[] = [];
  for (const [topicId] of state) {
    const category = classifyTopic(state, graph, topicId, pretestPassed);
    if (category !== "WEAK" && category !== "DECAYED" && category !== "BOTTLENECK") {
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
    });
  }
  gaps.sort(
    (a, b) =>
      b.bottleneckScore - a.bottleneckScore ||
      a.mastery - b.mastery,
  );
  return gaps;
}
