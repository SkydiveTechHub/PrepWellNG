import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildGraph,
  type GraphNode,
  type GraphEdge,
  type KnowledgeGraph,
} from "../src/engines/learning/graph";
import { stabilityForLevel, type TopicState, type TopicStateMap } from "../src/engines/learning/mastery";
import { recommendNext } from "../src/engines/learning/recommend";
import {
  classifyTopic,
  gapQueue,
  descendants,
  bottleneckScore,
} from "../src/engines/learning/gaps";
import { masteryLevelFromScore } from "../src/lib/lesson-engine";

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

function edge(from: string, to: string, overrides: Partial<GraphEdge> = {}): GraphEdge {
  return {
    id: `${from}->${to}`,
    from,
    to,
    kind: "PREREQUISITE",
    strength: 1,
    rationale: null,
    ...overrides,
  };
}

function mkState(
  topicId: string,
  opts: {
    mastery: number;
    retention?: number | null;
    lastStudy?: Date | null;
    /** Defaults to a value above CONFIDENCE_FLOOR (0.35) — a well-evidenced synthetic topic. */
    confidence?: number;
    /** Defaults to 3 (== OBSERVATION_FLOOR) split across acc, so DECAYED's gate is clearable. */
    accObservations?: number;
    lessonObservations?: number;
    srsObservations?: number;
  },
): TopicState {
  const level = masteryLevelFromScore(opts.mastery);
  return {
    topicId,
    acc: opts.mastery,
    lessonM: null,
    srs: null,
    lastStudy: opts.lastStudy ?? null,
    mastery: opts.mastery,
    level,
    stability: stabilityForLevel(level),
    retention: opts.retention !== undefined ? opts.retention : null,
    // A well-evidenced synthetic topic: acc is non-null, so real mass exists
    // and confidence must be above CONFIDENCE_FLOOR. Zero here would describe
    // a state the fold cannot produce.
    confidence: opts.confidence ?? 0.8,
    // 3 == OBSERVATION_FLOOR, matching the default confidence's "well-evidenced"
    // intent so DECAYED's separate observation gate is cleared by default too.
    accObservations: opts.accObservations ?? 3,
    lessonObservations: opts.lessonObservations ?? 0,
    srsObservations: opts.srsObservations ?? 0,
  };
}

/** A topic the student has never touched: zero mastery, no evidence. */
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

// ─── recommendNext ─────────────────────────────────────────

test("recommendNext: only available, unmastered topics qualify", () => {
  const graph = graphWith(["p", "a", "b"], [edge("p", "a"), edge("a", "b")]);
  const state = stateMap([
    ["p", mkState("p", { mastery: 90 })],
    ["a", mkState("a", { mastery: 30 })],
    ["b", mkState("b", { mastery: 0 })],
  ]);
  const picks = recommendNext(state, graph, { k: 3, now });
  // b is gated behind a (30 < 60), p is already mastered.
  assert.deepEqual(
    picks.map((r) => r.topicId),
    ["a"],
  );
});

test("recommendNext: ranks by urgency and caps at k", () => {
  const graph = graphWith(["x", "y"]);
  const state = stateMap([
    ["x", mkState("x", { mastery: 20 })],
    ["y", mkState("y", { mastery: 60 })],
  ]);
  const picks = recommendNext(state, graph, { k: 1, now });
  assert.deepEqual(picks.map((r) => r.topicId), ["x"]);
  assert.ok(picks[0].score > 0);
});

test("recommendNext: leverage earns the 'Unlocks N topics' reason", () => {
  const graph = graphWith(
    ["v", "d1", "d2", "d3"],
    [edge("v", "d1"), edge("v", "d2"), edge("v", "d3")],
  );
  graph.nodes.set("d1", node("d1", { waecWeight: 0.2 }));
  graph.nodes.set("d2", node("d2", { waecWeight: 0.2 }));
  graph.nodes.set("d3", node("d3", { waecWeight: 0.2 }));
  const state = stateMap([
    ["v", mkState("v", { mastery: 40 })],
    ["d1", mkState("d1", { mastery: 0 })],
    ["d2", mkState("d2", { mastery: 0 })],
    ["d3", mkState("d3", { mastery: 0 })],
  ]);
  const [pick] = recommendNext(state, graph, { k: 1, now });
  assert.equal(pick.topicId, "v");
  assert.equal(pick.unlocks, 3);
  assert.equal(pick.reason, "Unlocks 3 topics");
});

test("recommendNext: high exam weight and low mastery earns 'High-yield'", () => {
  const graph = graphWith(["h"]);
  graph.nodes.set("h", node("h", { waecWeight: 0.8, jambWeight: 0.4 }));
  const state = stateMap([["h", mkState("h", { mastery: 10 })]]);
  const [pick] = recommendNext(state, graph, { k: 1, now });
  assert.ok(pick.reason.startsWith("High-yield"), pick.reason);
});

test("recommendNext: fading retention earns the 'revise while fresh' reason", () => {
  const graph = graphWith(["f"]);
  const state = stateMap([
    ["f", mkState("f", { mastery: 60, retention: 0.6 })],
  ]);
  const [pick] = recommendNext(state, graph, { k: 1, now });
  assert.equal(pick.reason, "Fading — revise while fresh");
});

test("recommendNext: falls back to retention consolidation when nothing is learnable", () => {
  const graph = graphWith(["done", "fading"]);
  const state = stateMap([
    ["done", mkState("done", { mastery: 95, retention: 0.9 })],
    ["fading", mkState("fading", { mastery: 90, retention: 0.6 })],
  ]);
  const picks = recommendNext(state, graph, { k: 3, now });
  assert.deepEqual(picks.map((r) => r.topicId), ["fading"]);
  assert.equal(picks[0].reason, "Consolidate — retention fading");
});

test("recommendNext: everything healthy yields an empty list", () => {
  const graph = graphWith(["done"]);
  const state = stateMap([["done", mkState("done", { mastery: 95, retention: 0.9 })]]);
  assert.deepEqual(recommendNext(state, graph, { k: 3, now }), []);
});

// ─── classifyTopic ─────────────────────────────────────────

test("classifyTopic: mastery below 50 is WEAK", () => {
  const graph = graphWith(["t"]);
  const state = stateMap([["t", mkState("t", { mastery: 30 })]]);
  assert.equal(classifyTopic(state, graph, "t"), "WEAK");
});

test("classifyTopic: retention below 0.8 is DECAYED", () => {
  const graph = graphWith(["t"]);
  const state = stateMap([
    ["t", mkState("t", { mastery: 60, retention: 0.7, lastStudy: new Date(now.getTime() - 86400000) })],
  ]);
  assert.equal(classifyTopic(state, graph, "t"), "DECAYED");
});

test("classifyTopic: a locked topic gating ≥2 unmastered dependents is a BOTTLENECK", () => {
  const graph = graphWith(
    ["p", "b", "c", "d"],
    [edge("p", "b"), edge("b", "c"), edge("b", "d")],
  );
  const state = stateMap([
    ["p", mkState("p", { mastery: 20 })],
    ["b", mkState("b", { mastery: 60, retention: 0.9, lastStudy: new Date(now.getTime() - 86400000) })],
    ["c", mkState("c", { mastery: 0 })],
    ["d", mkState("d", { mastery: 0 })],
  ]);
  assert.equal(classifyTopic(state, graph, "b"), "BOTTLENECK");
});

test("classifyTopic: sub-floor confidence withholds WEAK even with low mastery", () => {
  // Confidence below CONFIDENCE_FLOOR (0.35) with mastery well below
  // WEAK_MASTERY. If the confidence gate were deleted, this topic's mastery
  // alone would satisfy WEAK's threshold and the classification would flip
  // from null to "WEAK" — so this fails under a reverted/deleted gate.
  const graph = graphWith(["t"]);
  const state = stateMap([["t", mkState("t", { mastery: 30, confidence: 0.1 })]]);
  assert.equal(classifyTopic(state, graph, "t"), null);
});

test("classifyTopic: BOTTLENECK is exempt from the confidence gate", () => {
  // b is locked behind p (55 < GATE 60) and gates two unmastered dependents
  // (c, d), but b's own confidence is below CONFIDENCE_FLOOR. If BOTTLENECK
  // were made to respect the confidence gate (i.e. required `confident` like
  // WEAK does), this classification would flip from "BOTTLENECK" to null —
  // so this fails under that reversal.
  const graph = graphWith(
    ["p", "b", "c", "d"],
    [edge("p", "b"), edge("b", "c"), edge("b", "d")],
  );
  const state = stateMap([
    ["p", mkState("p", { mastery: 55 })],
    ["b", mkState("b", { mastery: 20, confidence: 0.1 })],
    ["c", mkState("c", { mastery: 0 })],
    ["d", mkState("d", { mastery: 0 })],
  ]);
  assert.equal(classifyTopic(state, graph, "b"), "BOTTLENECK");
});

test("classifyTopic: a healthy mastered topic is not a gap", () => {
  const graph = graphWith(["t"]);
  const state = stateMap([
    ["t", mkState("t", { mastery: 85, retention: 0.9, lastStudy: new Date(now.getTime() - 86400000) })],
  ]);
  assert.equal(classifyTopic(state, graph, "t"), null);
});

test("classifyTopic: an untouched topic is UNTOUCHED, never a diagnosed WEAK", () => {
  const graph = graphWith(["t"]);
  const state = stateMap([["t", untouchedState("t")]]);
  assert.equal(classifyTopic(state, graph, "t"), "UNTOUCHED");
});

test("classifyTopic: a locked untouched topic is not a gap", () => {
  const graph = graphWith(["p", "t"], [edge("p", "t")]);
  const state = stateMap([
    ["p", untouchedState("p")],
    ["t", untouchedState("t")],
  ]);
  // p is a root (available) → UNTOUCHED. t is locked behind p's zero mastery,
  // and has no evidence → no diagnosed gap.
  assert.equal(classifyTopic(state, graph, "p"), "UNTOUCHED");
  assert.equal(classifyTopic(state, graph, "t"), null);
});

test("gapQueue: untouched topics never surface as gaps", () => {
  // A branching graph where every topic has zero mastery and no evidence —
  // a brand-new user's situation. Nothing may be reported as a gap.
  const graph = graphWith(
    ["a", "b", "c", "d"],
    [edge("a", "b"), edge("b", "c"), edge("b", "d")],
  );
  const state = stateMap([
    ["a", untouchedState("a")],
    ["b", untouchedState("b")],
    ["c", untouchedState("c")],
    ["d", untouchedState("d")],
  ]);
  assert.deepEqual(gapQueue(state, graph), []);
});

// ─── bottleneckScore & gapQueue ────────────────────────────

test("descendants: transitive closure over the DAG", () => {
  const graph = graphWith(["a", "b", "c", "d"], [edge("a", "b"), edge("b", "c"), edge("c", "d")]);
  assert.deepEqual([...descendants(graph, "a")].sort(), ["b", "c", "d"]);
  assert.deepEqual([...descendants(graph, "c")].sort(), ["d"]);
});

test("bottleneckScore: weighted downstream multiplier", () => {
  const graph = graphWith(
    ["a", "b", "c", "d"],
    [
      edge("a", "b"),
      edge("b", "c"),
      edge("c", "d"),
    ],
  );
  graph.nodes.set("a", node("a", { waecWeight: 0.1 }));
  graph.nodes.set("b", node("b", { waecWeight: 0.5 }));
  graph.nodes.set("c", node("c", { waecWeight: 0.3 }));
  graph.nodes.set("d", node("d", { waecWeight: 0.2 }));
  assert.ok(Math.abs(bottleneckScore(graph, "a") - 1.0) < 1e-9);
  assert.ok(Math.abs(bottleneckScore(graph, "b") - 0.5) < 1e-9);
  assert.ok(Math.abs(bottleneckScore(graph, "c") - 0.2) < 1e-9);
});

test("gapQueue: bottlenecks rank above equal-weak isolated topics", () => {
  const graph = graphWith(
    ["p", "bottleneck", "iso", "c", "d"],
    [edge("p", "bottleneck"), edge("bottleneck", "c"), edge("bottleneck", "d")],
  );
  graph.nodes.set("bottleneck", node("bottleneck", { waecWeight: 0.6 }));
  graph.nodes.set("iso", node("iso", { waecWeight: 0.1 }));
  graph.nodes.set("c", node("c", { waecWeight: 0.4 }));
  graph.nodes.set("d", node("d", { waecWeight: 0.3 }));
  const state = stateMap([
    // p is mastered past WEAK but below the GATE, so it locks bottleneck
    // without being a gap itself.
    ["p", mkState("p", { mastery: 55, lastStudy: new Date(now.getTime() - 86400000) })],
    ["bottleneck", mkState("bottleneck", { mastery: 60, retention: 0.9, lastStudy: new Date(now.getTime() - 86400000) })],
    ["iso", mkState("iso", { mastery: 30 })],
    ["c", mkState("c", { mastery: 0 })],
    ["d", mkState("d", { mastery: 0 })],
  ]);
  const queue = gapQueue(state, graph);
  const ids = queue.map((g) => g.topicId);
  // bottleneck is locked behind p (55 < 60) and gates c+d (weight 0.7)
  // → ranks above the equal-weak isolated topics.
  assert.equal(ids[0], "bottleneck");
  assert.ok(ids.includes("iso"));
  const bottleneck = queue.find((g) => g.topicId === "bottleneck");
  assert.equal(bottleneck?.category, "BOTTLENECK");
  assert.ok((bottleneck?.bottleneckScore ?? 0) > 0);
});

test("gapQueue: ties break by lower mastery first", () => {
  const graph = graphWith(["w1", "w2"]);
  const state = stateMap([
    ["w1", mkState("w1", { mastery: 45 })],
    ["w2", mkState("w2", { mastery: 20 })],
  ]);
  const queue = gapQueue(state, graph);
  assert.deepEqual(queue.map((g) => g.topicId), ["w2", "w1"]);
});
