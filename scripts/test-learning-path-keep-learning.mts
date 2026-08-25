import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildGraph,
  type GraphNode,
  type GraphEdge,
  type KnowledgeGraph,
} from "../src/engines/learning/graph";
import {
  stabilityForLevel,
  type TopicState,
  type TopicStateMap,
} from "../src/engines/learning/mastery";
import {
  CONTINUE_REASON,
  keepLearning,
  recommendNext,
} from "../src/engines/learning/recommend";
import { masteryLevelFromScore } from "../src/lib/lesson-engine";

// The dashboard's "Keep learning" rail: the student's own recent lessons
// first, then evidence-backed recommendations — never a topic nothing has
// observed.

const now = new Date("2026-08-01T09:00:00Z");

function node(id: string, overrides: Partial<GraphNode> = {}): GraphNode {
  return {
    id,
    subjectId: "subj-1",
    title: `Topic ${id}`,
    slug: `topic-${id}`,
    orderIndex: 0,
    estimatedMinutes: 45,
    waecWeight: 0,
    jambWeight: 0,
    prerequisiteTopicId: null,
    ...overrides,
  };
}

function edge(from: string, to: string): GraphEdge {
  return {
    id: `${from}->${to}`,
    from,
    to,
    kind: "PREREQUISITE",
    strength: 1,
    rationale: null,
  };
}

/** A topic with real evidence behind its mastery. */
function mkState(
  topicId: string,
  opts: { mastery: number; retention?: number | null; observations?: number },
): TopicState {
  const level = masteryLevelFromScore(opts.mastery);
  return {
    topicId,
    acc: opts.mastery,
    lessonM: null,
    srs: null,
    lastStudy: new Date("2026-07-20T09:00:00Z"),
    mastery: opts.mastery,
    level,
    stability: stabilityForLevel(level),
    retention: opts.retention ?? null,
    confidence: 0.8,
    accObservations: opts.observations ?? 3,
    lessonObservations: 0,
    srsObservations: 0,
  };
}

/** A topic the student has never touched: mastery is the prior, not a measurement. */
function untouchedState(topicId: string): TopicState {
  const level = masteryLevelFromScore(0);
  return {
    topicId,
    acc: null,
    lessonM: null,
    srs: null,
    lastStudy: null,
    mastery: 0,
    level,
    stability: stabilityForLevel(level),
    retention: null,
    confidence: 0,
    accObservations: 0,
    lessonObservations: 0,
    srsObservations: 0,
  };
}

function graphWith(nodes: string[], edges: GraphEdge[] = []): KnowledgeGraph {
  return buildGraph(nodes.map((id) => node(id)), edges);
}

function stateMap(entries: Array<[string, TopicState]>): TopicStateMap {
  return new Map(entries);
}

// ─── recent lessons lead the rail ──────────────────────────

test("keepLearning: leads with the recent lessons still short of mastery", () => {
  const graph = graphWith(["l1", "l2", "l3", "other"]);
  const state = stateMap([
    ["l1", mkState("l1", { mastery: 30 })],
    ["l2", mkState("l2", { mastery: 55 })],
    ["l3", mkState("l3", { mastery: 10 })],
    ["other", mkState("other", { mastery: 5 })],
  ]);
  const picks = keepLearning(state, graph, ["l1", "l2", "l3"], { k: 3, now });
  assert.deepEqual(picks.map((p) => p.topicId), ["l1", "l2", "l3"]);
  assert.ok(picks.every((p) => p.reason === CONTINUE_REASON));
});

test("keepLearning: a mastered lesson topic drops off the rail", () => {
  const graph = graphWith(["done", "l2"]);
  const state = stateMap([
    ["done", mkState("done", { mastery: 90 })],
    ["l2", mkState("l2", { mastery: 20 })],
  ]);
  const picks = keepLearning(state, graph, ["done", "l2"], { k: 3, now });
  assert.deepEqual(picks.map((p) => p.topicId), ["l2"]);
});

test("keepLearning: several lessons on one topic yield one card", () => {
  const graph = graphWith(["l1", "l2"]);
  const state = stateMap([
    ["l1", mkState("l1", { mastery: 30 })],
    ["l2", mkState("l2", { mastery: 30 })],
  ]);
  const picks = keepLearning(state, graph, ["l1", "l1", "l1", "l2"], {
    k: 3,
    now,
  });
  assert.deepEqual(picks.map((p) => p.topicId), ["l1", "l2"]);
});

test("keepLearning: a lesson topic outside the graph is skipped", () => {
  const graph = graphWith(["l1"]);
  const state = stateMap([["l1", mkState("l1", { mastery: 30 })]]);
  const picks = keepLearning(state, graph, ["ghost", "l1"], { k: 3, now });
  assert.deepEqual(picks.map((p) => p.topicId), ["l1"]);
});

test("keepLearning: a lesson topic gated by an unmet prerequisite still shows", () => {
  // The student is already inside the lesson — a readiness gate here would be
  // arguing with something that already happened.
  const graph = graphWith(["prereq", "gated"], [edge("prereq", "gated")]);
  const state = stateMap([
    ["prereq", mkState("prereq", { mastery: 10 })],
    ["gated", mkState("gated", { mastery: 20 })],
  ]);
  const picks = keepLearning(state, graph, ["gated"], { k: 1, now });
  assert.deepEqual(picks.map((p) => p.topicId), ["gated"]);
});

// ─── the top-up ────────────────────────────────────────────

test("keepLearning: tops up from the engine when recent lessons run short", () => {
  const graph = graphWith(["l1", "ranked"]);
  const state = stateMap([
    ["l1", mkState("l1", { mastery: 60 })],
    ["ranked", mkState("ranked", { mastery: 10 })],
  ]);
  const picks = keepLearning(state, graph, ["l1"], { k: 3, now });
  assert.deepEqual(picks.map((p) => p.topicId), ["l1", "ranked"]);
  assert.equal(picks[0].reason, CONTINUE_REASON);
  assert.notEqual(picks[1].reason, CONTINUE_REASON);
});

test("keepLearning: the top-up never repeats a recent-lesson pick", () => {
  const graph = graphWith(["l1", "ranked"]);
  const state = stateMap([
    ["l1", mkState("l1", { mastery: 10 })],
    ["ranked", mkState("ranked", { mastery: 20 })],
  ]);
  const picks = keepLearning(state, graph, ["l1"], { k: 3, now });
  assert.deepEqual(picks.map((p) => p.topicId), ["l1", "ranked"]);
});

test("keepLearning: the top-up skips topics with no evidence at all", () => {
  const graph = graphWith(["touched", "untouched"]);
  const state = stateMap([
    ["touched", mkState("touched", { mastery: 40 })],
    // Higher urgency than `touched`, but nothing has observed it — showing it
    // would assert a topic the student has never met.
    ["untouched", untouchedState("untouched")],
  ]);
  const picks = keepLearning(state, graph, [], { k: 3, now });
  assert.deepEqual(picks.map((p) => p.topicId), ["touched"]);
});

test("keepLearning: no lessons and no evidence yields an empty rail", () => {
  const graph = graphWith(["a", "b"]);
  const state = stateMap([
    ["a", untouchedState("a")],
    ["b", untouchedState("b")],
  ]);
  assert.deepEqual(keepLearning(state, graph, [], { k: 3, now }), []);
});

test("keepLearning: k caps the rail even when every lesson qualifies", () => {
  const graph = graphWith(["l1", "l2", "l3", "l4"]);
  const state = stateMap([
    ["l1", mkState("l1", { mastery: 10 })],
    ["l2", mkState("l2", { mastery: 20 })],
    ["l3", mkState("l3", { mastery: 30 })],
    ["l4", mkState("l4", { mastery: 40 })],
  ]);
  const picks = keepLearning(state, graph, ["l1", "l2", "l3", "l4"], {
    k: 3,
    now,
  });
  assert.deepEqual(picks.map((p) => p.topicId), ["l1", "l2", "l3"]);
});

// ─── the options recommendNext gained ──────────────────────

test("recommendNext: exclude drops a topic from the ranking", () => {
  const graph = graphWith(["x", "y"]);
  const state = stateMap([
    ["x", mkState("x", { mastery: 10 })],
    ["y", mkState("y", { mastery: 40 })],
  ]);
  const picks = recommendNext(state, graph, {
    k: 3,
    now,
    exclude: new Set(["x"]),
  });
  assert.deepEqual(picks.map((p) => p.topicId), ["y"]);
});

test("recommendNext: exclude also applies to the consolidation fallback", () => {
  const graph = graphWith(["fading", "alsoFading"]);
  const state = stateMap([
    ["fading", mkState("fading", { mastery: 90, retention: 0.5 })],
    ["alsoFading", mkState("alsoFading", { mastery: 90, retention: 0.6 })],
  ]);
  const picks = recommendNext(state, graph, {
    k: 3,
    now,
    exclude: new Set(["fading"]),
  });
  assert.deepEqual(picks.map((p) => p.topicId), ["alsoFading"]);
});

test("recommendNext: without evidenceOnly an untouched topic still ranks", () => {
  // The default behaviour the rest of the app relies on is unchanged — only
  // the dashboard rail opts into the stricter filter.
  const graph = graphWith(["untouched"]);
  const state = stateMap([["untouched", untouchedState("untouched")]]);
  const picks = recommendNext(state, graph, { k: 3, now });
  assert.deepEqual(picks.map((p) => p.topicId), ["untouched"]);
});
