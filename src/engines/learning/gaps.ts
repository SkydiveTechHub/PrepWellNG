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
 */
export function classifyTopic(
  state: TopicStateMap,
  graph: KnowledgeGraph,
  topicId: string,
): GapCategory | null {
  const topic = state.get(topicId);
  if (!topic || !graph.nodes.has(topicId)) return null;

  if (topic.mastery < WEAK_MASTERY) return "WEAK";
  if (topic.retention != null && topic.retention < GAP_RETENTION) {
    return "DECAYED";
  }
  if (isAvailable(topicId, state, graph) && topic.lastStudy == null) {
    return "UNTOUCHED";
  }
  const blocked = unmasteredDependents(state, graph, topicId);
  if (!isAvailable(topicId, state, graph) && blocked.length >= 2) {
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
): TopicGap[] {
  const gaps: TopicGap[] = [];
  for (const [topicId] of state) {
    const category = classifyTopic(state, graph, topicId);
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
    });
  }
  gaps.sort(
    (a, b) =>
      b.bottleneckScore - a.bottleneckScore ||
      a.mastery - b.mastery,
  );
  return gaps;
}
