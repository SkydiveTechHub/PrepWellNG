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
import { classifyTopic, gapQueue } from "../src/engines/learning/gaps";
import { CONFIDENCE_FLOOR } from "../src/engines/learning/evidence";

const now = new Date("2026-08-12T09:00:00Z");

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

function graphWith(nodes: string[], edges: GraphEdge[] = []): KnowledgeGraph {
  return buildGraph(nodes.map((id) => node(id)), edges);
}

/** A topic whose state is folded from `count` answers, all correct or all wrong. */
function stateFrom(topicId: string, count: number, correct: boolean): TopicStateMap {
  const events: FoldEvent[] = Array.from({ length: count }, (_, i) => ({
    seq: BigInt(i + 1),
    topicId,
    kind: "QUESTION_ANSWERED" as const,
    correct,
    score: null,
    difficulty: "INTERMEDIATE" as const,
    seconds: 30,
    occurredAt: now,
  }));
  const aggregate = foldEvents(emptyAggregate(topicId, "subj-1", now), events, now);
  return new Map([[topicId, scoreAggregate(aggregate, now)]]);
}

// ─── The claim Phase 1 did not deliver ─────────────────────

test("classifyTopic: one wrong answer is not enough to diagnose a weakness", () => {
  const graph = graphWith(["t"]);
  const state = stateFrom("t", 1, false);
  const topic = state.get("t");

  assert.equal(topic?.mastery, 39, "one wrong intermediate answer scores 39");
  assert.ok(
    (topic?.confidence ?? 0) < CONFIDENCE_FLOOR,
    "and carries too little confidence to act on",
  );
  assert.equal(classifyTopic(state, graph, "t"), null);
});

test("gapQueue: a thinly-evidenced topic is not listed as a gap", () => {
  const graph = graphWith(["t"]);
  assert.deepEqual(gapQueue(stateFrom("t", 1, false), graph), []);
});

test("classifyTopic: ten wrong answers still diagnose a weakness", () => {
  const graph = graphWith(["t"]);
  const state = stateFrom("t", 10, false);
  const topic = state.get("t");

  assert.equal(topic?.mastery, 24);
  assert.ok((topic?.confidence ?? 0) >= CONFIDENCE_FLOOR);
  assert.equal(classifyTopic(state, graph, "t"), "WEAK");
});

test("gapQueue: a well-evidenced weak topic is listed", () => {
  const graph = graphWith(["t"]);
  const gaps = gapQueue(stateFrom("t", 10, false), graph);
  assert.equal(gaps.length, 1);
  assert.equal(gaps[0].topicId, "t");
  assert.equal(gaps[0].category, "WEAK");
});

test("classifyTopic: the gate withholds judgement, it does not invert it", () => {
  // Confidence rises with evidence; the same wrong-answer rate crosses the
  // floor and becomes diagnosable rather than flipping category.
  const graph = graphWith(["t"]);
  assert.equal(classifyTopic(stateFrom("t", 1, false), graph, "t"), null);
  assert.equal(classifyTopic(stateFrom("t", 10, false), graph, "t"), "WEAK");
});

// ─── Unchanged behaviour ───────────────────────────────────

test("classifyTopic: a topic with no evidence at all is UNTOUCHED, not null", () => {
  const graph = graphWith(["t"]);
  const state: TopicStateMap = new Map([
    ["t", scoreAggregate(emptyAggregate("t", "subj-1", now), now)],
  ]);
  assert.equal(classifyTopic(state, graph, "t"), "UNTOUCHED");
});

test("gapQueue: UNTOUCHED topics are never gaps", () => {
  const graph = graphWith(["t"]);
  const state: TopicStateMap = new Map([
    ["t", scoreAggregate(emptyAggregate("t", "subj-1", now), now)],
  ]);
  assert.deepEqual(gapQueue(state, graph), []);
});

test("gapQueue: a strong topic is not a gap", () => {
  const graph = graphWith(["t"]);
  assert.deepEqual(gapQueue(stateFrom("t", 20, true), graph), []);
});
