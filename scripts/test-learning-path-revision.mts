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
  isRevisionDue,
  revisionPriority,
  revisionQueue,
  revisionItemToRecommendation,
  REVISION_RETENTION,
  type RevisionExtras,
  type RevisionExtrasMap,
} from "../src/engines/learning/revision";
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
  opts: { mastery: number; retention?: number | null; lastStudy?: Date | null },
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
    // Synthetic state, so no evidence backs it. Nothing in this suite reads
    // confidence; it is here because TopicState requires it.
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

function extras(
  overrides: Partial<RevisionExtras> = {},
): RevisionExtras {
  return { cadenceDueAt: null, dueSrsCards: 0, ...overrides };
}

function extrasMap(
  entries: Array<[string, RevisionExtras]>,
): RevisionExtrasMap {
  return new Map(entries);
}

// ─── isRevisionDue ─────────────────────────────────────────

test("isRevisionDue: retention faded below target", () => {
  const topic = mkState("t", { mastery: 85, retention: 0.6 });
  assert.equal(isRevisionDue(topic, extras(), now), true);
  const fresh = mkState("t", { mastery: 85, retention: 0.9 });
  assert.equal(isRevisionDue(fresh, extras(), now), false);
});

test("isRevisionDue: fixed-cadence pass is due today", () => {
  const topic = mkState("t", { mastery: 85, retention: 0.9 });
  assert.equal(
    isRevisionDue(
      topic,
      extras({ cadenceDueAt: new Date(now.getTime() - 3600_000) }),
      now,
    ),
    true,
  );
  assert.equal(
    isRevisionDue(
      topic,
      extras({ cadenceDueAt: new Date(now.getTime() + 86_400_000) }),
      now,
    ),
    false,
  );
});

test("isRevisionDue: due flashcard SRS cards trigger revision", () => {
  const topic = mkState("t", { mastery: 85, retention: 0.9 });
  assert.equal(isRevisionDue(topic, extras({ dueSrsCards: 3 }), now), true);
});

test("isRevisionDue: retention equals target is not decayed", () => {
  const topic = mkState("t", { mastery: 85, retention: REVISION_RETENTION });
  assert.equal(isRevisionDue(topic, extras(), now), false);
});

// ─── revisionPriority ──────────────────────────────────────

test("revisionPriority: decay × exam weight × blocked multiplier", () => {
  const graph = graphWith(
    ["p", "b", "iso", "c", "d"],
    [edge("p", "b"), edge("b", "c"), edge("b", "d")],
  );
  graph.nodes.set("b", node("b", { waecWeight: 0.5 }));
  graph.nodes.set("iso", node("iso", { waecWeight: 0.5 }));
  graph.nodes.set("c", node("c", { waecWeight: 0.3 }));
  graph.nodes.set("d", node("d", { waecWeight: 0.3 }));
  const state = stateMap([
    ["p", mkState("p", { mastery: 90 })],
    ["b", mkState("b", { mastery: 85, retention: 0.7 })],
    ["iso", mkState("iso", { mastery: 85, retention: 0.7 })],
    ["c", mkState("c", { mastery: 0 })],
    ["d", mkState("d", { mastery: 0 })],
  ]);
  // b blocks c+d (2 unmastered) → maxBlocked = 2, iso blocks nothing.
  const maxBlocked = 2;
  const b = revisionPriority("b", state, graph, extras(), maxBlocked);
  const iso = revisionPriority("iso", state, graph, extras(), maxBlocked);
  assert.ok(b > iso, `expected ${b} > ${iso}`);
  // 0.15 decay × 0.5 weight × (1 + 2/2) = 0.15
  assert.ok(Math.abs(b - 0.15) < 1e-9);
  // 0.15 decay × 0.5 weight × (1 + 0/2) = 0.075
  assert.ok(Math.abs(iso - 0.075) < 1e-9);
});

test("revisionPriority: no retention evidence scores decay 0", () => {
  const graph = graphWith(["t"]);
  graph.nodes.set("t", node("t", { waecWeight: 1 }));
  const state = stateMap([["t", mkState("t", { mastery: 85, retention: null })]]);
  assert.equal(revisionPriority("t", state, graph, extras(), 0), 0);
});

// ─── revisionQueue ─────────────────────────────────────────

test("revisionQueue: only due, studied topics appear, ranked by priority", () => {
  const graph = graphWith(
    ["p", "hot", "warm", "healthy"],
    [edge("p", "hot"), edge("hot", "warm")],
  );
  graph.nodes.set("hot", node("hot", { waecWeight: 1 }));
  graph.nodes.set("warm", node("warm", { waecWeight: 1 }));
  const studied = new Date(now.getTime() - 86_400_000);
  const state = stateMap([
    ["p", mkState("p", { mastery: 90, retention: 0.9, lastStudy: studied })],
    ["hot", mkState("hot", { mastery: 90, retention: 0.5, lastStudy: studied })],
    ["warm", mkState("warm", { mastery: 90, retention: 0.75, lastStudy: studied })],
    ["healthy", mkState("healthy", { mastery: 90, retention: 0.95, lastStudy: studied })],
  ]);
  const queue = revisionQueue(state, graph, extrasMap([]), { now });
  assert.deepEqual(queue.map((i) => i.topicId), ["hot", "warm"]);
});

test("revisionQueue: untouched topics never enter the queue", () => {
  const graph = graphWith(["t"]);
  const state = stateMap([["t", mkState("t", { mastery: 0, retention: null, lastStudy: null })]]);
  const queue = revisionQueue(
    state,
    graph,
    extrasMap([["t", extras({ dueSrsCards: 2 })]]),
    { now },
  );
  assert.deepEqual(queue, []);
});

test("revisionQueue: reasons distinguish decay, SRS, and cadence", () => {
  const graph = graphWith(["dec", "srs", "cad"]);
  const studied = new Date(now.getTime() - 86_400_000);
  const state = stateMap([
    ["dec", mkState("dec", { mastery: 90, retention: 0.6, lastStudy: studied })],
    ["srs", mkState("srs", { mastery: 90, retention: 0.9, lastStudy: studied })],
    ["cad", mkState("cad", { mastery: 90, retention: 0.9, lastStudy: studied })],
  ]);
  const queue = revisionQueue(
    state,
    graph,
    extrasMap([
      ["dec", extras()],
      ["srs", extras({ dueSrsCards: 3 })],
      ["cad", extras({ cadenceDueAt: new Date(now.getTime() - 3600_000) })],
    ]),
    { now },
  );
  const byId = new Map(queue.map((i) => [i.topicId, i]));
  assert.equal(byId.get("dec")?.reason, "Retention 60% — re-cement it");
  assert.equal(byId.get("srs")?.reason, "3 cards due for review");
  assert.equal(byId.get("cad")?.reason, "Scheduled revision is due");
  assert.equal(byId.get("srs")?.dueSrsCards, 3);
  assert.equal(byId.get("cad")?.cadenceDue, true);
});

test("revisionQueue: k caps the returned list", () => {
  const graph = graphWith(["a", "b", "c"]);
  const studied = new Date(now.getTime() - 86_400_000);
  const state = stateMap([
    ["a", mkState("a", { mastery: 90, retention: 0.6, lastStudy: studied })],
    ["b", mkState("b", { mastery: 90, retention: 0.6, lastStudy: studied })],
    ["c", mkState("c", { mastery: 90, retention: 0.6, lastStudy: studied })],
  ]);
  const queue = revisionQueue(state, graph, extrasMap([]), { now, k: 2 });
  assert.equal(queue.length, 2);
});

test("revisionItemToRecommendation: hands off to the recommendation shape", () => {
  const graph = graphWith(
    ["p", "t", "d1", "d2"],
    [edge("p", "t"), edge("t", "d1"), edge("t", "d2")],
  );
  graph.nodes.set("t", node("t", { waecWeight: 0.4 }));
  const studied = new Date(now.getTime() - 86_400_000);
  const state = stateMap([
    ["p", mkState("p", { mastery: 90 })],
    ["t", mkState("t", { mastery: 90, retention: 0.7, lastStudy: studied })],
    ["d1", mkState("d1", { mastery: 0 })],
    ["d2", mkState("d2", { mastery: 0 })],
  ]);
  const [item] = revisionQueue(
    state,
    graph,
    extrasMap([["t", extras()]]),
    { now },
  );
  const rec = revisionItemToRecommendation(item);
  assert.equal(rec.topicId, "t");
  assert.equal(rec.title, "Topic t");
  assert.equal(rec.reason, "Retention 70% — re-cement it");
  assert.equal(rec.unlocks, 2);
  assert.equal(rec.score, item.priority);
});
