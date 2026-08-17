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
import { masteryLevelFromScore } from "../src/lib/lesson-engine";
import {
  isAvailable,
  prereqStatuses,
  loadPretestPassed,
  GATE,
  PRETEST_PASS,
} from "../src/engines/learning/availability";
import { recommendNext } from "../src/engines/learning/recommend";
import { generatePlan } from "../src/engines/planner/plan";

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

// ─── constants ──────────────────────────────────────────────

test("pretest pass mark is 80%", () => {
  assert.equal(PRETEST_PASS, 80);
});

// ─── isAvailable ────────────────────────────────────────────

test("isAvailable: a gated topic stays locked without a pretest pass", () => {
  const graph = graphWith(["p", "d"], [edge("p", "d")]);
  const state = stateMap([
    ["p", mkState("p", { mastery: 10 })],
    ["d", mkState("d", { mastery: 0 })],
  ]);
  assert.equal(isAvailable("d", state, graph), false);
});

test("isAvailable: a pretest pass on the prereq opens the gate", () => {
  const graph = graphWith(["p", "d"], [edge("p", "d")]);
  const state = stateMap([
    ["p", mkState("p", { mastery: 10 })],
    ["d", mkState("d", { mastery: 0 })],
  ]);
  assert.equal(
    isAvailable("d", state, graph, new Set(["p"])),
    true,
  );
});

test("isAvailable: a mastery-meeting prereq still opens the gate without a pretest pass", () => {
  const graph = graphWith(["p", "d"], [edge("p", "d")]);
  const state = stateMap([
    ["p", mkState("p", { mastery: GATE })],
    ["d", mkState("d", { mastery: 0 })],
  ]);
  assert.equal(isAvailable("d", state, graph), true);
});

test("isAvailable: strength-0.5 prereqs need only half the gate", () => {
  const graph = graphWith(["p", "d"], [edge("p", "d", { strength: 0.5 })]);
  const state = stateMap([
    ["p", mkState("p", { mastery: GATE * 0.5 })],
    ["d", mkState("d", { mastery: 0 })],
  ]);
  assert.equal(isAvailable("d", state, graph), true);
});

test("isAvailable: a pretest pass on an unrelated topic does not open the gate", () => {
  const graph = graphWith(["p", "d"], [edge("p", "d")]);
  const state = stateMap([
    ["p", mkState("p", { mastery: 0 })],
    ["d", mkState("d", { mastery: 0 })],
  ]);
  assert.equal(isAvailable("d", state, graph, new Set(["other"])), false);
});

test("isAvailable: pretest passes satisfy every incoming prerequisite", () => {
  const graph = graphWith(["p1", "p2", "d"], [edge("p1", "d"), edge("p2", "d")]);
  const state = stateMap([
    ["p1", mkState("p1", { mastery: 0 })],
    ["p2", mkState("p2", { mastery: 0 })],
    ["d", mkState("d", { mastery: 0 })],
  ]);
  assert.equal(isAvailable("d", state, graph), false);
  assert.equal(isAvailable("d", state, graph, new Set(["p1"])), false);
  assert.equal(isAvailable("d", state, graph, new Set(["p1", "p2"])), true);
});

// ─── prereqStatuses ─────────────────────────────────────────

test("prereqStatuses: a pretest-passed prereq reports met", () => {
  const graph = graphWith(["p", "d"], [edge("p", "d")]);
  const state = stateMap([
    ["p", mkState("p", { mastery: 10 })],
    ["d", mkState("d", { mastery: 0 })],
  ]);
  const statuses = prereqStatuses("d", graph, state, new Set(["p"]));
  assert.equal(statuses.length, 1);
  assert.equal(statuses[0].slug, "topic-p");
  assert.equal(statuses[0].mastery, 10);
  assert.equal(statuses[0].need, GATE);
  assert.equal(statuses[0].met, true);
});

test("prereqStatuses: without a pretest pass the same prereq is unmet", () => {
  const graph = graphWith(["p", "d"], [edge("p", "d")]);
  const state = stateMap([
    ["p", mkState("p", { mastery: 10 })],
    ["d", mkState("d", { mastery: 0 })],
  ]);
  const [status] = prereqStatuses("d", graph, state);
  assert.equal(status.met, false);
});

// ─── loadPretestPassed ──────────────────────────────────────

test("loadPretestPassed: returns only earned topic ids, scoped to subject", async () => {
  const prisma = {
    performanceMetric: {
      findMany: async ({ where }: { where: Record<string, unknown> }) => {
        assert.equal(where.studentId, "student-1");
        assert.equal(where.subjectId, "subj-1");
        const rows = [
          { topicId: "t-earned" },
          { topicId: "t-earned-2" },
          { topicId: null },
        ];
        return rows.filter((row) => row.topicId !== null);
      },
    },
  };
  const passed = await loadPretestPassed(
    prisma as never,
    "student-1",
    "subj-1",
  );
  assert.deepEqual([...passed].sort(), ["t-earned", "t-earned-2"]);
});

// ─── recommendNext ──────────────────────────────────────────

test("recommendNext: a pretest pass lets a gated topic surface", () => {
  const graph = graphWith(["p", "d"], [edge("p", "d")]);
  const state = stateMap([
    ["p", mkState("p", { mastery: 10 })],
    ["d", mkState("d", { mastery: 0 })],
  ]);
  const withoutPretest = recommendNext(state, graph, { k: 3, now });
  assert.ok(
    withoutPretest.every((r) => r.topicId !== "d"),
    "d must stay hidden while gated behind an unmet prereq",
  );
  const withPretest = recommendNext(state, graph, {
    k: 3,
    now,
    pretestPassed: new Set(["p"]),
  });
  assert.ok(
    withPretest.some((r) => r.topicId === "d"),
    "d must surface once its prereq is self-certified",
  );
});

// ─── generatePlan ───────────────────────────────────────────

test("generatePlan: a pretest pass unlocks a topic whose prereq is outside the plan", () => {
  const graph = buildGraph(
    [node("p", { subjectId: "subj-1" }), node("d", { subjectId: "subj-2" })],
    [edge("p", "d")],
  );
  const state = stateMap([
    ["p", mkState("p", { mastery: 10 })],
    ["d", mkState("d", { mastery: 0 })],
  ]);
  const input = {
    graph,
    state,
    subjectIds: ["subj-2"],
    start: new Date("2026-08-01T00:00:00Z"),
    targetDate: new Date("2026-08-30T00:00:00Z"),
    dailyMinutes: 30,
    sessionMinutes: 30,
  };

  const without = generatePlan({ ...input });
  assert.ok(
    without.every((draft) => draft.topicId !== "d"),
    "d must not be scheduled while its out-of-plan prereq is unmet",
  );

  const withPretest = generatePlan({ ...input, pretestPassed: new Set(["p"]) });
  assert.ok(
    withPretest.some((draft) => draft.topicId === "d"),
    "d must be scheduled once its prereq is self-certified",
  );
});
