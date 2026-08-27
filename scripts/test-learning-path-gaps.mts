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

/**
 * Same as `stateFrom`, but the answers happened `ageDays` before `now` — the
 * fixture used to pull confidence and retention down together (they both fall
 * with age) while the raw observation count stays put. `classifyTopic` is
 * always scored at `now`, so this is the only way to exercise "old evidence"
 * rather than "thin evidence".
 */
function agedStateFrom(
  topicId: string,
  count: number,
  correct: boolean,
  ageDays: number,
): TopicStateMap {
  const occurredAt = new Date(now.getTime() - ageDays * 86_400_000);
  const events: FoldEvent[] = Array.from({ length: count }, (_, i) => ({
    seq: BigInt(i + 1),
    topicId,
    kind: "QUESTION_ANSWERED" as const,
    correct,
    score: null,
    difficulty: "INTERMEDIATE" as const,
    seconds: 30,
    occurredAt,
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

test("gapQueue: abandonment counts reach the gap", () => {
  const graph = graphWith(["t"]);
  const gaps = gapQueue(
    stateFrom("t", 10, false),
    graph,
    new Set(),
    new Map([["t", 3]]),
  );
  assert.equal(gaps.length, 1);
  assert.equal(gaps[0].abandonedCount, 3);
});

test("gapQueue: a topic never abandoned reports zero, not undefined", () => {
  const graph = graphWith(["t"]);
  const gaps = gapQueue(stateFrom("t", 10, false), graph);
  assert.equal(gaps[0].abandonedCount, 0);
});

// ─── DECAYED gates on observations, not confidence ─────────

test("classifyTopic: a 2-observation faded topic is not DECAYED", () => {
  const graph = graphWith(["t"]);
  const state = agedStateFrom("t", 2, true, 200);
  const topic = state.get("t");

  assert.ok((topic?.retention ?? 1) < 0.8, "evidence has faded");
  assert.equal(topic?.accObservations, 2);
  assert.equal(
    classifyTopic(state, graph, "t"),
    null,
    "two observations is below OBSERVATION_FLOOR, so DECAYED is withheld",
  );
});

test("classifyTopic: a 3-observation faded topic is DECAYED", () => {
  const graph = graphWith(["t"]);
  const state = agedStateFrom("t", 3, true, 200);
  const topic = state.get("t");

  assert.ok((topic?.retention ?? 1) < 0.8, "evidence has faded");
  assert.equal(topic?.accObservations, 3);
  assert.equal(classifyTopic(state, graph, "t"), "DECAYED");
});

test("classifyTopic: aged evidence is still DECAYED even once confidence has decayed below the floor", () => {
  // The regression this task exists to fix: confidence and retention both
  // fall with age, so gating DECAYED on confidence let a topic silently stop
  // being flagged once its own evidence got old enough. 10 observations, all
  // correct, 200 days old: plenty of raw evidence, but stale.
  const graph = graphWith(["t"]);
  const state = agedStateFrom("t", 10, true, 200);
  const topic = state.get("t");

  assert.ok(
    (topic?.confidence ?? 1) < CONFIDENCE_FLOOR,
    "confidence has decayed below the floor",
  );
  assert.ok((topic?.retention ?? 1) < 0.8, "retention has faded below GAP_RETENTION");
  assert.equal(topic?.accObservations, 10, "the raw observation count does not decay");
  assert.equal(
    classifyTopic(state, graph, "t"),
    "DECAYED",
    "a topic once measured ten times and now faded must still be flagged DECAYED",
  );
});

test("gapQueue: abandonment does not change the ranking", () => {
  // `b` has the lower mastery, so it ranks first on the existing rule. Heavy
  // abandonment on `a` must not move it.
  const graph = graphWith(["a", "b"]);
  const state = new Map([
    ...stateFrom("a", 10, false),
    ...stateFrom("b", 20, false),
  ]);
  const ranked = gapQueue(state, graph, new Set(), new Map([["a", 99]]));
  assert.deepEqual(
    ranked.map((g) => g.topicId),
    gapQueue(state, graph).map((g) => g.topicId),
    "ranking must be identical with and without abandonment data",
  );
});

// ─── Abandonment alone can qualify a topic as a gap ────────

test("classifyTopic: one abandonment on an unevidenced topic is not a gap", () => {
  const graph = graphWith(["t"]);
  const state: TopicStateMap = new Map([
    ["t", scoreAggregate(emptyAggregate("t", "subj-1", now), now)],
  ]);
  assert.equal(
    classifyTopic(state, graph, "t", new Set(), new Map([["t", 1]])),
    "UNTOUCHED",
    "one abandonment is below ABANDONED_FLOOR, so the topic falls back to UNTOUCHED",
  );
});

test("classifyTopic: two abandonments on an unevidenced topic is ABANDONED", () => {
  const graph = graphWith(["t"]);
  const state: TopicStateMap = new Map([
    ["t", scoreAggregate(emptyAggregate("t", "subj-1", now), now)],
  ]);
  assert.equal(
    classifyTopic(state, graph, "t", new Set(), new Map([["t", 2]])),
    "ABANDONED",
  );
});

test("classifyTopic: an evidenced weak topic with five abandonments is still WEAK", () => {
  const graph = graphWith(["t"]);
  const state = stateFrom("t", 10, false);
  assert.equal(
    classifyTopic(state, graph, "t", new Set(), new Map([["t", 5]])),
    "WEAK",
    "abandonment only rescues the no-evidence case; a topic with evidence keeps its classification",
  );
});

test("gapQueue: an unevidenced, twice-abandoned topic enters the queue as ABANDONED", () => {
  const graph = graphWith(["t"]);
  const state: TopicStateMap = new Map([
    ["t", scoreAggregate(emptyAggregate("t", "subj-1", now), now)],
  ]);
  const gaps = gapQueue(state, graph, new Set(), new Map([["t", 2]]));
  assert.equal(gaps.length, 1);
  assert.equal(gaps[0].category, "ABANDONED");
  assert.equal(gaps[0].abandonedCount, 2);
});

test("gapQueue: ABANDONED sorts below WEAK even with lower mastery", () => {
  // `weak` has real evidence and a positive mastery figure. `abandoned` has no
  // evidence at all, so its mastery and bottleneckScore are both 0 — under the
  // plain score-desc/mastery-asc comparator it would sort *ahead* of `weak`.
  // The tier key must force it to the bottom regardless.
  const graph = graphWith(["weak", "abandoned"]);
  const state = new Map<string, ReturnType<typeof scoreAggregate>>([
    ...stateFrom("weak", 10, false),
    ["abandoned", scoreAggregate(emptyAggregate("abandoned", "subj-1", now), now)],
  ]);
  const gaps = gapQueue(state, graph, new Set(), new Map([["abandoned", 2]]));
  assert.deepEqual(
    gaps.map((g) => g.topicId),
    ["weak", "abandoned"],
    "ABANDONED must sort after WEAK regardless of mastery",
  );
});

test("gapQueue: WEAK/DECAYED/BOTTLENECK ordering among themselves is unchanged", () => {
  // Two WEAK topics, ranked purely by the existing score-desc/mastery-asc
  // rule. Neither is abandoned, so the new tier key must not disturb this.
  const graph = graphWith(["a", "b"]);
  const state = new Map([
    ...stateFrom("a", 10, false),
    ...stateFrom("b", 20, false),
  ]);
  const gaps = gapQueue(state, graph);
  assert.deepEqual(
    gaps.map((g) => g.topicId),
    ["b", "a"],
    "b has lower mastery than a, so it must still rank first",
  );
});
