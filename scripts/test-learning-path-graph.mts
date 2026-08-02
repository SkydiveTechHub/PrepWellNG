import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildGraph,
  lintKnowledgeGraph,
  topologicalOrder,
  findCycle,
  outgoingEdges,
  loadGraph,
  type GraphNode,
  type GraphEdge,
  type KnowledgeGraph,
} from "../src/engines/learning/graph";

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

const a = node("a");
const b = node("b");
const c = node("c");

test("empty graph reports EMPTY_GRAPH", () => {
  const graph: KnowledgeGraph = buildGraph([], []);
  const issues = lintKnowledgeGraph(graph);
  assert.ok(issues.some((i) => i.code === "EMPTY_GRAPH"));
});

test("a valid DAG lints clean and topologically sorts", () => {
  const graph = buildGraph([a, b, c], [edge("a", "b"), edge("b", "c")]);
  assert.deepEqual(lintKnowledgeGraph(graph), []);
  assert.deepEqual(topologicalOrder(graph), ["a", "b", "c"]);
});

test("topological order keeps prerequisites before dependents regardless of input order", () => {
  const graph = buildGraph(
    [c, a, b],
    [edge("c", "b"), edge("b", "a")],
  );
  const order = topologicalOrder(graph);
  assert.ok(order.indexOf("c") < order.indexOf("b"));
  assert.ok(order.indexOf("b") < order.indexOf("a"));
  assert.equal(order.length, 3);
});

test("a cycle is reported with its path", () => {
  const graph = buildGraph(
    [a, b, c],
    [edge("a", "b"), edge("b", "c"), edge("c", "a")],
  );
  const issues = lintKnowledgeGraph(graph);
  const cycle = issues.find((i) => i.code === "CYCLE");
  assert.ok(cycle, "expected a CYCLE issue");
  assert.equal(cycle!.nodes?.length, 3);
  const path = findCycle(graph);
  assert.equal(path!.length, 3);
  assert.equal(path![0], "a");
  assert.ok(
    outgoingEdges(graph, path![2]).some((e) => e.to === path![0]),
    "the cycle closes back to its start",
  );
  assert.ok(topologicalOrder(graph).length < 3, "cycle nodes never order");
});

test("duplicate edges are rejected", () => {
  const graph = buildGraph(
    [a, b],
    [edge("a", "b"), edge("a", "b")],
  );
  const issues = lintKnowledgeGraph(graph);
  assert.ok(issues.some((i) => i.code === "DUPLICATE_EDGE"));
});

test("self-referential edges are rejected", () => {
  const graph = buildGraph([a], [edge("a", "a")]);
  const issues = lintKnowledgeGraph(graph);
  assert.ok(issues.some((i) => i.code === "SELF_EDGE"));
});

test("strength must be in (0, 1]", () => {
  const bad = buildGraph([a, b], [edge("a", "b", { strength: 0 })]);
  const over = buildGraph([a, b], [edge("a", "b", { strength: 1.5 })]);
  assert.ok(lintKnowledgeGraph(bad).some((i) => i.code === "INVALID_STRENGTH"));
  assert.ok(lintKnowledgeGraph(over).some((i) => i.code === "INVALID_STRENGTH"));
});

test("orphan edge endpoints are rejected", () => {
  const graph = buildGraph([a], [edge("a", "missing")]);
  const issues = lintKnowledgeGraph(graph);
  assert.ok(issues.some((i) => i.code === "ORPHAN_REF"));
});

test("cross-subject edges require a CORE prereq subject", () => {
  const maths = node("m", { subjectId: "maths" });
  const physics = node("p", { subjectId: "physics" });
  const withCore = buildGraph(
    [maths, physics],
    [edge("m", "p")],
  );
  assert.ok(
    lintKnowledgeGraph(withCore, { coreSubjectIds: new Set(["maths"]) }).length === 0,
    "CORE prereq subject passes the lint",
  );
  assert.ok(
    lintKnowledgeGraph(withCore).some((i) => i.code === "CROSS_SUBJECT"),
    "non-CORE prereq subject fails the lint",
  );
});

test("legacy scalar prerequisites fall back to edges in loadGraph", async () => {
  const legacyTopics = [
    node("a", { subjectId: "s1", prerequisiteTopicId: null }),
    node("b", { subjectId: "s1", prerequisiteTopicId: "a" }),
  ];
  const prisma = {
    topicEdge: { findMany: async () => [] },
    topic: {
      findMany: async (args: { where: Record<string, unknown> }) =>
        "subjectId" in args.where ? legacyTopics : [],
    },
  } as never;
  const graph = await loadGraph(prisma, "s1");
  assert.equal(graph.edges.length, 1);
  assert.equal(graph.edges[0].from, "a");
  assert.equal(graph.edges[0].to, "b");
  assert.equal(graph.edges[0].kind, "PREREQUISITE");
  assert.equal(graph.nodes.size, 2);
});
