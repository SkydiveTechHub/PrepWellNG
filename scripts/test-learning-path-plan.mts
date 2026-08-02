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
  generatePlan,
  computePlanWindow,
  REVISION_OFFSETS,
  MOCK_COUNT,
  type PlanItemDraft,
} from "../src/engines/planner/plan";

const DAY_MS = 86_400_000;

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
  };
}

function graphWith(nodes: string[], edges: GraphEdge[] = []): KnowledgeGraph {
  return buildGraph(nodes.map((id) => node(id)), edges);
}

function stateMap(entries: Array<[string, TopicState]>): TopicStateMap {
  return new Map(entries);
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number): Date {
  return new Date(startOfDay(date).getTime() + days * DAY_MS);
}

function dayIndex(item: PlanItemDraft, anchor: Date): number {
  return Math.round((item.date.getTime() - startOfDay(anchor).getTime()) / DAY_MS);
}

function planInput(
  overrides: Partial<Parameters<typeof generatePlan>[0]> = {},
): Parameters<typeof generatePlan>[0] {
  return {
    graph: graphWith([]),
    state: stateMap([]),
    subjectIds: ["subj-1"],
    start: new Date("2026-08-01T00:00:00Z"),
    targetDate: new Date("2026-08-30T00:00:00Z"),
    dailyMinutes: 60,
    sessionMinutes: 30,
    ...overrides,
  };
}

// ─── computePlanWindow ─────────────────────────────────────

test("computePlanWindow: last 20% clamped to 14..21 days", () => {
  const start = new Date("2026-08-01T00:00:00Z");
  assert.equal(computePlanWindow(start, new Date("2026-08-30T00:00:00Z")).runwayDays, 14);
  assert.equal(computePlanWindow(start, new Date("2026-08-30T00:00:00Z")).learnDays, 16);
  assert.equal(computePlanWindow(start, new Date("2026-08-15T00:00:00Z")).learnDays, 1);
  assert.equal(computePlanWindow(start, new Date("2026-12-01T00:00:00Z")).runwayDays, 21);
});

test("computePlanWindow: runway never exceeds the plan length", () => {
  const start = new Date("2026-08-01T00:00:00Z");
  const win = computePlanWindow(start, start);
  assert.equal(win.totalDays, 1);
  assert.equal(win.runwayDays, 1);
  assert.equal(win.learnDays, 0);
});

test("computePlanWindow: runwayStart is the first runway day", () => {
  const start = new Date("2026-08-01T00:00:00Z");
  const win = computePlanWindow(start, new Date("2026-08-30T00:00:00Z"));
  assert.equal(win.runwayStart.getTime(), addDays(start, win.learnDays).getTime());
});

// ─── topological order ─────────────────────────────────────

test("generatePlan: dependent topics wait for every scheduled prereq", () => {
  const graph = graphWith(["a", "b", "c"], [edge("a", "b"), edge("b", "c")]);
  const state = stateMap([
    ["a", mkState("a", { mastery: 0 })],
    ["b", mkState("b", { mastery: 0 })],
    ["c", mkState("c", { mastery: 0 })],
  ]);
  const drafts = generatePlan(planInput({ graph, state }));
  const learning = drafts.filter(
    (d) => d.activityType === "LESSON" || d.activityType === "PRACTICE",
  );

  const firstIdx = new Map<string, number>();
  const lastIdx = new Map<string, number>();
  learning.forEach((d, i) => {
    if (d.topicId == null) return;
    if (!firstIdx.has(d.topicId)) firstIdx.set(d.topicId, i);
    lastIdx.set(d.topicId, i);
  });

  // Every dependent actually got scheduled — the static state (all mastery 0)
  // must not gate topics that the plan itself unlocks.
  for (const topic of ["a", "b", "c"]) {
    assert.ok(learning.some((d) => d.topicId === topic && d.activityType === "LESSON"), topic);
  }
  assert.ok(firstIdx.get("b")! > lastIdx.get("a")!);
  assert.ok(firstIdx.get("c")! > lastIdx.get("b")!);
});

test("generatePlan: a topic's lessons all precede its practice", () => {
  const graph = graphWith(["a", "b"], [edge("a", "b")]);
  const state = stateMap([
    ["a", mkState("a", { mastery: 10 })],
    ["b", mkState("b", { mastery: 0 })],
  ]);
  const drafts = generatePlan(planInput({ graph, state, dailyMinutes: 30 }));
  const anchor = new Date("2026-08-01T00:00:00Z");
  const lessons = drafts
    .filter((d) => d.topicId === "a" && d.activityType === "LESSON")
    .map((d) => dayIndex(d, anchor));
  const practice = drafts
    .filter((d) => d.topicId === "a" && d.activityType === "PRACTICE")
    .map((d) => dayIndex(d, anchor));
  assert.ok(lessons.length > 0);
  assert.ok(practice.length > 0);
  assert.ok(Math.max(...lessons) < Math.min(...practice));
});

// ─── revision passes ───────────────────────────────────────

test("generatePlan: +1/+3/+7/+14 revision passes follow each lesson block", () => {
  const graph = graphWith(["a", "b"], [edge("a", "b")]);
  const state = stateMap([
    ["a", mkState("a", { mastery: 0 })],
    ["b", mkState("b", { mastery: 0 })],
  ]);
  const drafts = generatePlan(planInput({ graph, state, dailyMinutes: 30 }));
  const anchor = new Date("2026-08-01T00:00:00Z");

  const lessonDays = drafts
    .filter((d) => d.topicId === "a" && d.activityType === "LESSON")
    .map((d) => dayIndex(d, anchor));
  const finishDay = Math.max(...lessonDays);

  const revisions = drafts
    .filter((d) => d.topicId === "a" && d.activityType === "REVISION")
    .map((d) => dayIndex(d, anchor))
    .sort((x, y) => x - y);

  assert.deepEqual(revisions, REVISION_OFFSETS.map((offset) => finishDay + offset));
});

test("generatePlan: revision passes are anchored to each topic, not shared", () => {
  const graph = graphWith(["a", "b"], [edge("a", "b")]);
  const state = stateMap([
    ["a", mkState("a", { mastery: 0 })],
    ["b", mkState("b", { mastery: 0 })],
  ]);
  const drafts = generatePlan(planInput({ graph, state, dailyMinutes: 30 }));
  const anchor = new Date("2026-08-01T00:00:00Z");

  const forTopic = (topic: string) => {
    const lessonDays = drafts
      .filter((d) => d.topicId === topic && d.activityType === "LESSON")
      .map((d) => dayIndex(d, anchor));
    const finish = Math.max(...lessonDays);
    const revisions = drafts
      .filter((d) => d.topicId === topic && d.activityType === "REVISION")
      .map((d) => dayIndex(d, anchor))
      .sort((x, y) => x - y);
    return { finish, revisions };
  };

  const a = forTopic("a");
  const b = forTopic("b");
  assert.ok(a.revisions.length > 0);
  assert.ok(b.revisions.length > 0);
  assert.notEqual(a.finish, b.finish);
  assert.deepEqual(a.revisions, REVISION_OFFSETS.map((o) => a.finish + o));
  assert.deepEqual(b.revisions, REVISION_OFFSETS.map((o) => b.finish + o));
});

// ─── runway ────────────────────────────────────────────────

test("generatePlan: mock exams sit inside the revision runway", () => {
  const graph = graphWith(["a", "b"], [edge("a", "b")]);
  const state = stateMap([
    ["a", mkState("a", { mastery: 0 })],
    ["b", mkState("b", { mastery: 0 })],
  ]);
  const input = planInput({ graph, state });
  const drafts = generatePlan(input);
  const win = computePlanWindow(input.start, input.targetDate);

  const mocks = drafts.filter((d) => d.activityType === "MOCK_EXAM");
  assert.equal(mocks.length, MOCK_COUNT);
  for (const mock of mocks) {
    assert.ok(mock.date.getTime() >= win.runwayStart.getTime());
    assert.ok(mock.date.getTime() <= input.targetDate.getTime());
  }
});

test("generatePlan: faded topics are consolidated inside the runway", () => {
  const graph = graphWith(["t", "x"], [edge("t", "x")]);
  const studied = new Date("2026-07-31T09:00:00Z");
  const state = stateMap([
    ["t", mkState("t", { mastery: 90, retention: 0.6, lastStudy: studied })],
    ["x", mkState("x", { mastery: 0 })],
  ]);
  const drafts = generatePlan(planInput({ graph, state }));

  const consolidation = drafts.filter(
    (d) => d.activityType === "REVISION" && d.topicId === "t",
  );
  assert.ok(consolidation.length >= 1);
  assert.match(consolidation[0].notes ?? "", /Retention 60%/);
});

// ─── weak-topic sizing ─────────────────────────────────────

test("generatePlan: weak topics get extra lessons and an extra practice", () => {
  const graph = graphWith(["w", "n"], [edge("w", "n")]);
  const state = stateMap([
    ["w", mkState("w", { mastery: 10 })],
    ["n", mkState("n", { mastery: 60 })],
  ]);
  const drafts = generatePlan(planInput({ graph, state, dailyMinutes: 30 }));

  const count = (topic: string, type: string) =>
    drafts.filter((d) => d.topicId === topic && d.activityType === type).length;

  // w (weak) → ceil(45 * 1.5 / 30) = 3 lessons + 2 practice.
  assert.equal(count("w", "LESSON"), 3);
  assert.equal(count("w", "PRACTICE"), 2);
  // n (sub-target but not weak) → ceil(45 / 30) = 2 lessons + 1 practice.
  assert.equal(count("n", "LESSON"), 2);
  assert.equal(count("n", "PRACTICE"), 1);
});

// ─── fallback round-robin ──────────────────────────────────

test("generatePlan: graph without edges falls back to round-robin", () => {
  const graph = graphWith(["x", "y"]);
  const drafts = generatePlan(
    planInput({ graph, state: stateMap([]), dailyMinutes: 30 }),
  );
  assert.equal(drafts.length, 30);
  assert.ok(
    drafts.every((d) =>
      ["LESSON", "PRACTICE", "REVISION", "PAST_QUESTIONS"].includes(d.activityType),
    ),
  );
  assert.deepEqual(
    drafts.slice(0, 4).map((d) => d.activityType),
    ["LESSON", "PRACTICE", "REVISION", "PAST_QUESTIONS"],
  );
  assert.ok(drafts.every((d) => d.topicId === null));
});

test("generatePlan: fallback cycles subjects round-robin", () => {
  const graph = graphWith([]);
  const drafts = generatePlan(
    planInput({
      graph,
      state: stateMap([]),
      subjectIds: ["s1", "s2"],
      dailyMinutes: 30,
    }),
  );
  assert.equal(drafts[0].subjectId, "s1");
  assert.equal(drafts[1].subjectId, "s2");
  assert.equal(drafts[2].subjectId, "s1");
});

// ─── determinism ───────────────────────────────────────────

test("generatePlan: identical inputs produce identical plans", () => {
  const graph = graphWith(["a", "b", "c"], [edge("a", "b"), edge("b", "c")]);
  const state = stateMap([
    ["a", mkState("a", { mastery: 0 })],
    ["b", mkState("b", { mastery: 0 })],
    ["c", mkState("c", { mastery: 0 })],
  ]);
  const base = planInput({ graph, state });
  const first = generatePlan(base);
  const second = generatePlan({ ...base });

  const serialize = (drafts: PlanItemDraft[]) =>
    drafts.map((d) => ({ ...d, date: d.date.toISOString() }));
  assert.deepEqual(serialize(first), serialize(second));
});
