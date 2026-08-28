import type { KnowledgeGraph } from "../learning/graph";
import { scoreAggregate, type TopicStateMap } from "../learning/mastery";
import { emptyAggregate } from "../learning/fold";
import { classifyTopic, bottleneckScore } from "../learning/gaps";
import type { GapCategory } from "../learning/gaps";
import { OBSERVATION_FLOOR } from "../learning/evidence";
import { TARGET } from "../learning/availability";

// The subject view's presentation of GapCategory.
// See docs/superpowers/specs/2026-08-28-performance-analytics-design.md §5.
//
// This is deliberately a thin layer over `classifyTopic` rather than a second
// classifier. The gating reasoning there — WEAK on confidence because it asks
// how well we know the topic now, DECAYED on raw observations because it asks
// whether the student once knew it — is not repeated or overridden here.
//
// What it adds is the split of `classifyTopic`'s `null`, which conflates two
// situations a gap queue does not care about and a performance view cannot
// confuse: a topic that is fine, and a topic we cannot yet judge.

export type TopicGroupKey =
  | "NEEDS_WORK"
  | "NEEDS_REVISION"
  | "UNPROVEN"
  | "COMING_ALONG"
  | "SOLID";

/**
 * Retention below which a Solid topic is flagged stale.
 *
 * Looser than GAP_RETENTION (0.8, the DECAYED threshold) on purpose: this is a
 * nudge to revise, not a diagnosis of decay, and it fires earlier so the nudge
 * arrives before the decay does.
 */
export const STALE_RETENTION = 0.9;

export type TopicRow = {
  topicId: string;
  subjectId: string;
  title: string;
  slug: string;
  group: TopicGroupKey;
  /** The underlying category, or null when `classifyTopic` withheld judgement. */
  category: GapCategory | null;
  mastery: number;
  retention: number | null;
  confidence: number;
  observations: number;
  /** Per-channel raw observation counts — see TopicState. Do not decay. */
  accObservations: number;
  lessonObservations: number;
  srsObservations: number;
  bottleneckScore: number;
  /** ISO string — this shape crosses the server -> client boundary. */
  lastStudy: string | null;
  /** SOLID only: retention has slipped but not far enough to be DECAYED. */
  stale: boolean;
};

export type TopicGroups = Record<TopicGroupKey, TopicRow[]>;

function emptyGroups(): TopicGroups {
  return {
    NEEDS_WORK: [],
    NEEDS_REVISION: [],
    UNPROVEN: [],
    COMING_ALONG: [],
    SOLID: [],
  };
}

/**
 * Every topic in the graph, sorted into five groups.
 *
 * The graph, not the state map, is the population: a topic with no evidence
 * must still appear, because in a performance view an untouched topic is a
 * finding rather than an absence.
 */
export function groupTopics(
  state: TopicStateMap,
  graph: KnowledgeGraph,
  pretestPassed: ReadonlySet<string> = new Set(),
  abandonedByTopic: ReadonlyMap<string, number> = new Map(),
  now: Date = new Date(),
): TopicGroups {
  const groups = emptyGroups();

  // classifyTopic (and the algorithms it calls, e.g. unmasteredDependents)
  // expect every graph topic to have a state entry — exactly the invariant
  // computeTopicState already guarantees in production by scoring an empty
  // aggregate for any topic with no persisted row. Mirror that here rather
  // than pass a sparse map: this fills in the untouched default, it does not
  // add or change any classification reasoning.
  const effectiveState: TopicStateMap = new Map(state);
  for (const [topicId, node] of graph.nodes) {
    if (effectiveState.has(topicId)) continue;
    effectiveState.set(
      topicId,
      scoreAggregate(emptyAggregate(topicId, node.subjectId, now), now),
    );
  }

  for (const [topicId, node] of graph.nodes) {
    const topic = effectiveState.get(topicId);
    const category = classifyTopic(
      effectiveState,
      graph,
      topicId,
      pretestPassed,
      abandonedByTopic,
    );
    const accObservations = topic?.accObservations ?? 0;
    const lessonObservations = topic?.lessonObservations ?? 0;
    const srsObservations = topic?.srsObservations ?? 0;
    const observations = accObservations + lessonObservations + srsObservations;
    const mastery = topic?.mastery ?? 0;
    const retention = topic?.retention ?? null;

    // Total over every category and over null. No unhandled case.
    let group: TopicGroupKey;
    if (category === "WEAK" || category === "BOTTLENECK") {
      group = "NEEDS_WORK";
    } else if (category === "DECAYED") {
      group = "NEEDS_REVISION";
    } else if (category === "UNTOUCHED" || category === "ABANDONED") {
      group = "UNPROVEN";
    } else if (observations < OBSERVATION_FLOOR) {
      // Includes the `classifyTopic` -> null case for a topic outside the
      // graph's available frontier: too little evidence either way.
      group = "UNPROVEN";
    } else if (mastery >= TARGET) {
      group = "SOLID";
    } else {
      // Bounded by TARGET alone. A topic under WEAK_MASTERY whose confidence
      // is too low for classifyTopic to call it WEAK belongs here, not in
      // NEEDS_WORK — see the module comment.
      group = "COMING_ALONG";
    }

    groups[group].push({
      topicId,
      subjectId: node.subjectId,
      title: node.title,
      slug: node.slug,
      group,
      category,
      mastery,
      retention,
      confidence: topic?.confidence ?? 0,
      observations,
      accObservations,
      lessonObservations,
      srsObservations,
      bottleneckScore: bottleneckScore(graph, topicId),
      lastStudy: topic?.lastStudy?.toISOString() ?? null,
      stale:
        group === "SOLID" && retention !== null && retention < STALE_RETENTION,
    });
  }

  // Needs work follows gapQueue's comparator exactly, so this page and the
  // learning path agree about which fix matters most.
  groups.NEEDS_WORK.sort(
    (a, b) => b.bottleneckScore - a.bottleneckScore || a.mastery - b.mastery,
  );
  // Weakest memory first — the thing most likely to be gone by the exam.
  groups.NEEDS_REVISION.sort((a, b) => (a.retention ?? 0) - (b.retention ?? 0));
  // Closest to target first: the quickest wins.
  groups.COMING_ALONG.sort((a, b) => b.mastery - a.mastery);
  // Stale first, then strongest.
  groups.SOLID.sort(
    (a, b) => Number(b.stale) - Number(a.stale) || b.mastery - a.mastery,
  );
  // Curriculum order — the sequence a student would actually study them in.
  const orderIndex = (id: string) => graph.nodes.get(id)?.orderIndex ?? 0;
  groups.UNPROVEN.sort((a, b) => orderIndex(a.topicId) - orderIndex(b.topicId));

  return groups;
}
