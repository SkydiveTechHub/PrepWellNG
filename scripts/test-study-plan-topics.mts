import { test } from "node:test";
import assert from "node:assert/strict";
import { buildGraph, type GraphEdge } from "../src/engines/learning/graph";
import type { TopicState, TopicStateMap } from "../src/engines/learning/mastery";
import type { TermContext } from "../src/engines/planner/term-context";
import {
  calendarTopicId,
  selectExamTopics,
  selectTermTopics,
  type PlanTopic,
  type SelectTermTopicsInput,
} from "../src/engines/planner/topics";

function topic(id: string, overrides: Partial<PlanTopic> = {}): PlanTopic {
  return {
    id,
    subjectId: "maths",
    title: `Topic ${id}`,
    slug: id,
    orderIndex: 0,
    estimatedMinutes: 45,
    waecWeight: 0,
    jambWeight: 0,
    prerequisiteTopicId: null,
    classLevel: "SS1",
    term: "FIRST",
    ...overrides,
  };
}

function prereq(from: string, to: string): GraphEdge {
  return { id: `${from}->${to}`, from, to, kind: "PREREQUISITE", strength: 1, rationale: null };
}

/** Only `mastery` is read by the planner; the rest satisfies the type. */
function states(entries: Record<string, number>): TopicStateMap {
  return new Map(
    Object.entries(entries).map(([id, mastery]) => [id, { topicId: id, mastery } as unknown as TopicState]),
  );
}

function inTerm(term: "FIRST" | "SECOND" | "THIRD", weekOfTerm: number, totalWeeks = 12): TermContext {
  return {
    kind: "in_term",
    source: "configured",
    current: { session: "2026/2027", term, startsOn: "2026-09-07", endsOn: "2026-12-15" },
    weekOfTerm,
    totalWeeks,
    weeksLeft: totalWeeks - weekOfTerm,
  };
}

const ss1First = [1, 2, 3, 4, 5, 6].map((n) => topic(`t${n}`, { orderIndex: n }));
const ss2 = topic("ss2-a", { classLevel: "SS2", orderIndex: 1 });

function input(overrides: Partial<SelectTermTopicsInput> = {}): SelectTermTopicsInput {
  const topics = [...ss1First, ss2];
  return {
    subjectId: "maths",
    classLevel: "SS1",
    termContext: inTerm("FIRST", 6),
    topics,
    graph: buildGraph(topics, []),
    state: states({}),
    pretestPassed: new Set(),
    positionTopicId: null,
    carryOver: [],
    ...overrides,
  };
}

const reasons = (sel: ReturnType<typeof selectTermTopics>) =>
  sel.candidates.map((c) => `${c.reason}:${c.topic.id}`);

test("mid-term SS1: current, catch-up, one preview, never a later class", () => {
  // Week 6 of 12 over 6 topics → index floor(5/12*6) = 2 → t3.
  const sel = selectTermTopics(input());
  assert.equal(sel.classIndex, 2);
  assert.deepEqual(reasons(sel), ["CURRENT:t3", "CATCH_UP:t1", "CATCH_UP:t2", "PREVIEW:t4"]);
  assert.equal(sel.behindBy, 2);
  assert.equal(sel.candidates.some((c) => c.topic.id === "ss2-a"), false);
});

test("mastered topics are left out", () => {
  const sel = selectTermTopics(input({ state: states({ t1: 90, t3: 75 }) }));
  assert.deepEqual(reasons(sel), ["CATCH_UP:t2", "PREVIEW:t4"]);
});

test("a position ahead of the calendar moves the class", () => {
  const sel = selectTermTopics(input({ positionTopicId: "t5" }));
  assert.equal(sel.classIndex, 4);
  assert.equal(sel.candidates[0].reason, "CURRENT");
  assert.equal(sel.candidates[0].topic.id, "t5");
});

test("a position behind the calendar removes catch-up", () => {
  const sel = selectTermTopics(input({ positionTopicId: "t1" }));
  assert.deepEqual(reasons(sel), ["CURRENT:t1", "PREVIEW:t2"]);
});

test("a position above the student's class is ignored", () => {
  const sel = selectTermTopics(input({ positionTopicId: "ss2-a" }));
  assert.equal(sel.classIndex, 2);
});

test("gap-fill pulls weak earlier-class prerequisites, deepest first", () => {
  const g0 = topic("g0", { classLevel: "SS1", term: "SECOND", orderIndex: 1 });
  const g1 = topic("g1", { classLevel: "SS1", term: "THIRD", orderIndex: 1 });
  const strong = topic("strong", { classLevel: "SS1", term: "THIRD", orderIndex: 2 });
  const cur = topic("cur", { classLevel: "SS2", term: "FIRST", orderIndex: 1 });
  const topics = [g0, g1, strong, cur];
  const sel = selectTermTopics(
    input({
      classLevel: "SS2",
      termContext: inTerm("FIRST", 1),
      topics,
      graph: buildGraph(topics, [prereq("g0", "g1"), prereq("g1", "cur"), prereq("strong", "cur")]),
      state: states({ g0: 10, g1: 30, strong: 80 }),
    }),
  );
  assert.deepEqual(reasons(sel), ["GAP_FILL:g0", "GAP_FILL:g1", "CURRENT:cur"]);
  assert.equal(sel.candidates[1].unlocks, "Topic cur");
});

test("holiday after first term: class at the end of first term, second term previewed", () => {
  const second = [1, 2, 3].map((n) => topic(`s${n}`, { term: "SECOND", orderIndex: n }));
  const topics = [...ss1First, ...second];
  const sel = selectTermTopics(
    input({
      topics,
      graph: buildGraph(topics, []),
      state: states({ t1: 90, t2: 90, t3: 90, t4: 90, t5: 90 }),
      termContext: {
        kind: "holiday",
        source: "configured",
        previous: { session: "2026/2027", term: "FIRST", startsOn: "2026-09-07", endsOn: "2026-12-15" },
        next: { session: "2026/2027", term: "SECOND", startsOn: "2027-01-06", endsOn: "2027-04-10" },
      },
    }),
  );
  assert.equal(sel.classIndex, 5);
  assert.deepEqual(reasons(sel), ["CURRENT:t6", "PREVIEW:s1", "PREVIEW:s2"]);
});

test("carry-over comes first and keeps its missed date; mastered carry-over is dropped", () => {
  const sel = selectTermTopics(
    input({
      state: states({ t6: 95 }),
      carryOver: [
        { topicId: "t5", subjectId: "maths", missedOn: "2026-09-10" },
        { topicId: "t6", subjectId: "maths", missedOn: "2026-09-11" },
      ],
    }),
  );
  assert.equal(sel.candidates[0].reason, "CARRY_OVER");
  assert.equal(sel.candidates[0].topic.id, "t5");
  assert.equal(sel.candidates[0].carriedFrom, "2026-09-10");
  assert.equal(sel.candidates.some((c) => c.topic.id === "t6"), false);
});

test("carryOverOnly keeps only carry-over", () => {
  const sel = selectTermTopics(
    input({ carryOverOnly: true, carryOver: [{ topicId: "t5", subjectId: "maths", missedOn: "2026-09-10" }] }),
  );
  assert.deepEqual(reasons(sel), ["CARRY_OVER:t5"]);
});

test("selectExamTopics ranks weak topics by exam weight within the class", () => {
  const a = topic("a", { waecWeight: 1, jambWeight: 1 });
  const b = topic("b", { waecWeight: 3, jambWeight: 2 });
  const c = topic("c", { waecWeight: 3, jambWeight: 2 });
  const done = topic("done", { waecWeight: 9 });
  const later = topic("later", { classLevel: "SS3", waecWeight: 9 });
  const ranked = selectExamTopics({
    topics: [a, b, c, done, later],
    classLevel: "SS2",
    state: states({ b: 40, c: 20, done: 90 }),
  });
  assert.deepEqual(ranked.map((x) => x.topic.id), ["c", "b", "a"]);
  assert.equal(ranked[0].reason, "EXAM");
});

test("calendarTopicId is the calendar guess used by the position picker", () => {
  assert.equal(calendarTopicId([...ss1First, ss2], "SS1", inTerm("FIRST", 6)), "t3");
  assert.equal(calendarTopicId([ss2], "SS1", inTerm("FIRST", 6)), null);
});
