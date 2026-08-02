import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildGraph,
  type GraphNode,
  type GraphEdge,
  type KnowledgeGraph,
} from "../src/engines/learning/graph";
import {
  assembleTopicState,
  compositeMastery,
  stabilityForLevel,
  topicRetention,
  STABILITY_BY_LEVEL,
  type TopicState,
  type TopicStateMap,
} from "../src/engines/learning/mastery";
import {
  GATE,
  TARGET,
  isAvailable,
  lessonUnlockState,
  prereqStatuses,
  resolvePrerequisiteEntries,
} from "../src/engines/learning/availability";
import { masteryLevelFromScore } from "../src/lib/lesson-engine";

const DAY_MS = 86_400_000;
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

function stateFor(topicId: string, acc: number): TopicState {
  return assembleTopicState(topicId, {
    acc,
    lessonM: null,
    srs: null,
    lastStudy: null,
  });
}

function graphWith(nodes: string[], edges: GraphEdge[] = []): KnowledgeGraph {
  return buildGraph(nodes.map((id) => node(id)), edges);
}

function stateMap(entries: Array<[string, number]>): TopicStateMap {
  return new Map(entries.map(([id, acc]) => [id, stateFor(id, acc)]));
}

// ─── Composite mastery ─────────────────────────────────────

test("compositeMastery: a single component stands alone at its full weight", () => {
  assert.equal(compositeMastery({ acc: 60, lessonM: null, srs: null }), 60);
  assert.equal(compositeMastery({ acc: null, lessonM: 50, srs: null }), 50);
  assert.equal(compositeMastery({ acc: null, lessonM: null, srs: 0.8 }), 80);
});

test("compositeMastery: all three components weight 0.45/0.35/0.20", () => {
  const score = compositeMastery({ acc: 60, lessonM: 50, srs: 0.8 });
  assert.equal(score, 61); // 27 + 17.5 + 16 = 60.5
});

test("compositeMastery: missing evidence reweights, it never zeroes", () => {
  const reweighted = compositeMastery({ acc: 60, lessonM: null, srs: 0.8 });
  assert.equal(reweighted, 66); // (0.45/0.65)*60 + (0.2/0.65)*80 = 66.15
});

test("compositeMastery: no evidence at all scores zero", () => {
  assert.equal(compositeMastery({ acc: null, lessonM: null, srs: null }), 0);
});

test("assembleTopicState: mastery maps to the existing level bands", () => {
  assert.equal(assembleTopicState("t", { acc: 90, lessonM: null, srs: null, lastStudy: null }).level, "STRONG");
  assert.equal(assembleTopicState("t", { acc: 70, lessonM: null, srs: null, lastStudy: null }).level, "COMPETENT");
  assert.equal(assembleTopicState("t", { acc: 55, lessonM: null, srs: null, lastStudy: null }).level, "DEVELOPING");
  assert.equal(assembleTopicState("t", { acc: 30, lessonM: null, srs: null, lastStudy: null }).level, "WEAK");
  assert.equal(masteryLevelFromScore(TARGET), "COMPETENT");
});

test("assembleTopicState: stability follows the level", () => {
  assert.equal(stabilityForLevel("WEAK"), 5);
  assert.equal(stabilityForLevel("DEVELOPING"), 14);
  assert.equal(stabilityForLevel("COMPETENT"), 30);
  assert.equal(stabilityForLevel("STRONG"), 60);
  assert.deepEqual(STABILITY_BY_LEVEL, { WEAK: 5, DEVELOPING: 14, COMPETENT: 30, STRONG: 60 });
});

// ─── Retention curve ───────────────────────────────────────

test("topicRetention: untouched topics have no retention", () => {
  assert.equal(topicRetention(null, 30, now), null);
});

test("topicRetention: R(S, S) = 0.9 — the due threshold on schedule", () => {
  const lastStudy = new Date(now.getTime() - 30 * DAY_MS);
  const retention = topicRetention(lastStudy, 30, now);
  assert.ok(retention !== null);
  assert.ok(Math.abs(retention - 0.9) < 1e-9, `expected 0.9, got ${retention}`);
});

test("topicRetention: monotone decreasing with time", () => {
  const yesterday = new Date(now.getTime() - 1 * DAY_MS);
  const twoMonths = new Date(now.getTime() - 60 * DAY_MS);
  const fresh = topicRetention(yesterday, 30, now) as number;
  const stale = topicRetention(twoMonths, 30, now) as number;
  assert.ok(fresh > stale);
  assert.ok(fresh <= 1);
});

// ─── Availability gate ─────────────────────────────────────

test("isAvailable: no prerequisites is always ready", () => {
  const graph = graphWith(["t"]);
  assert.equal(isAvailable("t", new Map(), graph), true);
});

test("isAvailable: a prerequisite below GATE blocks, at or above unlocks", () => {
  const graph = graphWith(["p", "t"], [edge("p", "t")]);
  const state = stateMap([["p", GATE - 1]]);
  assert.equal(isAvailable("t", state, graph), false);
  state.set("p", stateFor("p", GATE));
  assert.equal(isAvailable("t", state, graph), true);
});

test("isAvailable: strength scales the gate (0.5 strength → 30% needed)", () => {
  const graph = graphWith(["p", "t"], [edge("p", "t", { strength: 0.5 })]);
  assert.equal(isAvailable("t", stateMap([["p", 25]]), graph), false);
  assert.equal(isAvailable("t", stateMap([["p", 35]]), graph), true);
});

test("isAvailable: a readiness pretest pass bypasses the gate", () => {
  const graph = graphWith(["p", "t"], [edge("p", "t")]);
  const state = stateMap([["p", 0]]);
  assert.equal(isAvailable("t", state, graph, new Set(["p"])), true);
  assert.equal(isAvailable("t", state, graph), false);
});

test("isAvailable: only PREREQUISITE edges gate — related edges never block", () => {
  const graph = graphWith(
    ["a", "b", "t"],
    [
      edge("a", "t", { kind: "STRONG_RELATED" }),
      edge("b", "t", { kind: "RELATED" }),
    ],
  );
  assert.equal(isAvailable("t", new Map(), graph), true);
});

test("isAvailable: a chain of two prerequisites must both clear the gate", () => {
  const graph = graphWith(["a", "b", "t"], [edge("a", "b"), edge("b", "t")]);
  assert.equal(isAvailable("t", stateMap([["a", 90], ["b", 40]]), graph), false);
  assert.equal(isAvailable("t", stateMap([["a", 40], ["b", 90]]), graph), true);
});

test("prereqStatuses: exposes need, current mastery and met per edge", () => {
  const graph = graphWith(["p", "t"], [edge("p", "t", { strength: 0.5 })]);
  const chips = prereqStatuses("t", graph, stateMap([["p", 25]]));
  assert.equal(chips.length, 1);
  assert.equal(chips[0].need, 30);
  assert.equal(chips[0].mastery, 25);
  assert.equal(chips[0].met, false);
  assert.equal(chips[0].title, "Topic p");
});

// ─── Lesson unlock ─────────────────────────────────────────

test("lessonUnlockState: topic gate comes first", () => {
  const state = stateMap([]);
  const base = {
    topicReady: false,
    prerequisites: [],
    completedLessonIds: new Set<string>(),
    state,
    priorLessonIds: [] as string[],
  };
  assert.equal(lessonUnlockState(base), false);
  assert.equal(lessonUnlockState({ ...base, topicReady: true }), true);
});

test("lessonUnlockState: a required lesson must be completed", () => {
  const state = stateMap([]);
  const input = {
    topicReady: true,
    prerequisites: [{ kind: "lesson", lessonId: "l1" }] as const,
    completedLessonIds: new Set<string>(),
    state,
    priorLessonIds: [] as string[],
  };
  assert.equal(lessonUnlockState(input), false);
  assert.equal(lessonUnlockState({ ...input, completedLessonIds: new Set(["l1"]) }), true);
});

test("lessonUnlockState: a topic prerequisite needs mastery ≥ TARGET", () => {
  const state = stateMap([["p", 60]]);
  const input = {
    topicReady: true,
    prerequisites: [{ kind: "topic", topicId: "p" }] as const,
    completedLessonIds: new Set<string>(),
    state,
    priorLessonIds: [] as string[],
  };
  assert.equal(lessonUnlockState(input), false);
  assert.equal(lessonUnlockState({ ...input, state: stateMap([["p", TARGET]]) }), true);
});

test("lessonUnlockState: earlier lessons in the subtopic must all be done", () => {
  const state = stateMap([]);
  const input = {
    topicReady: true,
    prerequisites: [] as const,
    completedLessonIds: new Set(["l2"]),
    state,
    priorLessonIds: ["l1"] as string[],
  };
  assert.equal(lessonUnlockState(input), false);
  assert.equal(lessonUnlockState({ ...input, completedLessonIds: new Set(["l1", "l2"]) }), true);
});

test("resolvePrerequisiteEntries: maps titles to ids and drops unknowns", () => {
  const lessonIdByTitle = new Map([["Vectors", "l-vec"]]);
  const topicIdByTitle = new Map([["Statics", "t-stat"]]);
  const raw = [
    { lessonTitle: "Vectors", reason: "builds on it" },
    { topicTitle: "Statics" },
    { lessonTitle: "Missing lesson" },
    { reason: "no reference" },
  ];
  const resolved = resolvePrerequisiteEntries(raw, lessonIdByTitle, topicIdByTitle);
  assert.deepEqual(resolved, [
    { kind: "lesson", lessonId: "l-vec" },
    { kind: "topic", topicId: "t-stat" },
  ]);
});

test("resolvePrerequisiteEntries: non-array input yields nothing", () => {
  assert.deepEqual(resolvePrerequisiteEntries(null, new Map(), new Map()), []);
  assert.deepEqual(resolvePrerequisiteEntries("nope", new Map(), new Map()), []);
});
