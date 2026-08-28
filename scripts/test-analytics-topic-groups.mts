import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildGraph,
  type GraphNode,
  type GraphEdge,
  type KnowledgeGraph,
} from "../src/engines/learning/graph";
import { emptyAggregate, foldEvents, type FoldEvent } from "../src/engines/learning/fold";
import { scoreAggregate, type TopicStateMap } from "../src/engines/learning/mastery";
import { groupTopics } from "../src/engines/analytics/topic-groups";
import { TARGET } from "../src/engines/learning/availability";

const now = new Date("2026-08-28T09:00:00Z");
const DAY_MS = 86_400_000;

function node(id: string, overrides: Partial<GraphNode> = {}): GraphNode {
  return {
    id,
    subjectId: "subj-1",
    title: `Topic ${id}`,
    slug: `topic-${id}`,
    orderIndex: 0,
    estimatedMinutes: 45,
    waecWeight: 1,
    jambWeight: 1,
    prerequisiteTopicId: null,
    ...overrides,
  };
}

function graphWith(ids: string[], edges: GraphEdge[] = []): KnowledgeGraph {
  return buildGraph(ids.map((id) => node(id)), edges);
}

/** Folds `count` answers for one topic, `ageDays` before `now`. */
function stateFor(
  entries: { topicId: string; count: number; correct: boolean; ageDays?: number }[],
): TopicStateMap {
  const state: TopicStateMap = new Map();
  for (const entry of entries) {
    const occurredAt = new Date(now.getTime() - (entry.ageDays ?? 0) * DAY_MS);
    const events: FoldEvent[] = Array.from({ length: entry.count }, (_, i) => ({
      seq: BigInt(i + 1),
      topicId: entry.topicId,
      kind: "QUESTION_ANSWERED" as const,
      correct: entry.correct,
      score: null,
      difficulty: "INTERMEDIATE" as const,
      seconds: 30,
      occurredAt,
    }));
    const aggregate = foldEvents(
      emptyAggregate(entry.topicId, "subj-1", occurredAt),
      events,
      now,
    );
    state.set(entry.topicId, scoreAggregate(aggregate, now));
  }
  return state;
}

test("a topic with no evidence is Unproven, not weak", () => {
  const graph = graphWith(["t1"]);
  const groups = groupTopics(new Map(), graph, new Set(), new Map(), now);
  assert.deepEqual(groups.UNPROVEN.map((r) => r.topicId), ["t1"]);
  assert.equal(groups.NEEDS_WORK.length, 0);
});

test("a topic below the observation floor is Unproven, not Solid", () => {
  const graph = graphWith(["t1"]);
  const state = stateFor([{ topicId: "t1", count: 2, correct: true }]);
  const groups = groupTopics(state, graph, new Set(), new Map(), now);
  assert.deepEqual(groups.UNPROVEN.map((r) => r.topicId), ["t1"]);
  assert.equal(groups.SOLID.length, 0);
});

test("a well-evidenced strong topic is Solid", () => {
  const graph = graphWith(["t1"]);
  const state = stateFor([{ topicId: "t1", count: 30, correct: true }]);
  const groups = groupTopics(state, graph, new Set(), new Map(), now);
  assert.deepEqual(groups.SOLID.map((r) => r.topicId), ["t1"]);
  assert.ok((state.get("t1")?.mastery ?? 0) >= TARGET);
});

test("a well-evidenced failing topic needs work", () => {
  const graph = graphWith(["t1"]);
  const state = stateFor([{ topicId: "t1", count: 30, correct: false }]);
  const groups = groupTopics(state, graph, new Set(), new Map(), now);
  assert.deepEqual(groups.NEEDS_WORK.map((r) => r.topicId), ["t1"]);
});

test("an abandoned topic is Unproven, not Needs work", () => {
  const graph = graphWith(["t1"]);
  const groups = groupTopics(
    new Map(),
    graph,
    new Set(),
    new Map([["t1", 5]]),
    now,
  );
  assert.deepEqual(groups.UNPROVEN.map((r) => r.topicId), ["t1"]);
  assert.equal(groups.UNPROVEN[0].category, "ABANDONED");
  assert.equal(groups.NEEDS_WORK.length, 0);
});

test("every graph topic lands in exactly one group", () => {
  const graph = graphWith(["t1", "t2", "t3", "t4"]);
  const state = stateFor([
    { topicId: "t1", count: 30, correct: true },
    { topicId: "t2", count: 30, correct: false },
    { topicId: "t3", count: 2, correct: true },
    { topicId: "t4", count: 20, correct: true, ageDays: 400 },
  ]);
  const groups = groupTopics(state, graph, new Set(), new Map(), now);
  const all = [
    ...groups.NEEDS_WORK,
    ...groups.NEEDS_REVISION,
    ...groups.UNPROVEN,
    ...groups.COMING_ALONG,
    ...groups.SOLID,
  ];
  assert.equal(all.length, 4);
  assert.equal(new Set(all.map((r) => r.topicId)).size, 4);
});

test("Needs work is ordered by leverage then mastery, matching the gap queue", () => {
  // t-hub has two dependents, so it carries leverage; t-leaf has none.
  const nodes = ["t-hub", "t-leaf", "t-dep1", "t-dep2"];
  const edges: GraphEdge[] = [
    { id: "e1", from: "t-hub", to: "t-dep1", kind: "PREREQUISITE", strength: 1, rationale: null },
    { id: "e2", from: "t-hub", to: "t-dep2", kind: "PREREQUISITE", strength: 1, rationale: null },
  ];
  const graph = graphWith(nodes, edges);
  const state = stateFor([
    { topicId: "t-hub", count: 30, correct: false },
    { topicId: "t-leaf", count: 30, correct: false },
    { topicId: "t-dep1", count: 30, correct: false },
    { topicId: "t-dep2", count: 30, correct: false },
  ]);
  const groups = groupTopics(state, graph, new Set(), new Map(), now);
  assert.equal(groups.NEEDS_WORK[0].topicId, "t-hub");
});

test("a stale Solid topic is flagged", () => {
  const graph = graphWith(["t1"]);
  const state = stateFor([{ topicId: "t1", count: 40, correct: true, ageDays: 60 }]);
  const groups = groupTopics(state, graph, new Set(), new Map(), now);
  const row = [...groups.SOLID, ...groups.NEEDS_REVISION, ...groups.COMING_ALONG].find(
    (r) => r.topicId === "t1",
  );
  assert.ok(row, "topic should be grouped");
  assert.ok(
    row.stale || row.group === "NEEDS_REVISION",
    "aged strong evidence should read as stale or as needing revision",
  );
});
