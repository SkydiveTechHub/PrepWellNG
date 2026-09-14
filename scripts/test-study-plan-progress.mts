import { test } from "node:test";
import assert from "node:assert/strict";
import { buildGraph } from "../src/engines/learning/graph";
import type { TopicState, TopicStateMap } from "../src/engines/learning/mastery";
import type { TermContext } from "../src/engines/planner/term-context";
import type { PlanTopic } from "../src/engines/planner/topics";
import { inProgressTopics, type CompletedUnits } from "../src/engines/planner/layout";
import { completedUnitsFrom } from "../src/engines/planner/replan";
import { planWindow, type PlannerInput } from "../src/engines/planner/term-plan";

// Multi-day behaviour: a re-plan continues a topic from where the student left
// off instead of restarting it.

function topic(id: string, overrides: Partial<PlanTopic> = {}): PlanTopic {
  return {
    id, subjectId: "maths", title: `Topic ${id}`, slug: id, orderIndex: 0, estimatedMinutes: 30,
    waecWeight: 1, jambWeight: 1, prerequisiteTopicId: null, classLevel: "SS1", term: "FIRST",
    ...overrides,
  };
}

function states(entries: Record<string, number>): TopicStateMap {
  return new Map(Object.entries(entries).map(([id, mastery]) => [id, { topicId: id, mastery } as unknown as TopicState]));
}

const FIRST_TERM: TermContext = {
  kind: "in_term",
  source: "configured",
  current: { session: "2026/2027", term: "FIRST", startsOn: "2026-09-07", endsOn: "2026-11-29" },
  weekOfTerm: 2,
  totalWeeks: 12,
  weeksLeft: 10,
};

const a1 = topic("a1");

function input(overrides: Partial<PlannerInput> = {}): PlannerInput {
  return {
    today: "2026-09-14",
    planStart: "2026-09-14",
    mode: "TERM",
    classLevel: "SS1",
    targetDate: null,
    termContext: FIRST_TERM,
    // One 30-minute slot every day keeps the order of sessions easy to read.
    availability: { studyDays: [1, 2, 3, 4, 5, 6, 7], weekdayMinutes: 30, weekendMinutes: 30 },
    subjects: [{ id: "maths", name: "Mathematics", topics: [a1] }],
    graph: buildGraph([a1], []),
    state: new Map(),
    pretestPassed: new Set(),
    positions: new Map(),
    revisionDue: [],
    carryOver: [],
    fixed: [],
    mocksTaken: 0,
    completedUnits: new Map(),
    ...overrides,
  };
}

const lessonYesterday = new Map<string, CompletedUnits>([
  ["a1", { lessons: 1, practices: 0, lastLessonDate: "2026-09-14" }],
]);

test("day 1 schedules the lesson first", () => {
  const out = planWindow(input());
  assert.equal(out.items[0].activityType, "LESSON");
  assert.equal(out.items[0].topicId, "a1");
});

test("practice follows the lesson before its revision passes", () => {
  const out = planWindow(input());
  const types = out.items.filter((i) => i.topicId === "a1").map((i) => i.activityType);
  // Mastery 0 needs two practice sessions; revision only once they're placed.
  assert.deepEqual(types.slice(0, 4), ["LESSON", "PRACTICE", "PRACTICE", "REVISION"]);
});

test("(a) lesson done yesterday, mastery 55: no lesson again, practice placed today", () => {
  const out = planWindow(input({
    today: "2026-09-15",
    state: states({ a1: 55 }),
    completedUnits: lessonYesterday,
  }));
  const mine = out.items.filter((i) => i.topicId === "a1");
  assert.equal(mine.filter((i) => i.activityType === "LESSON").length, 0);
  const practice = mine.filter((i) => i.activityType === "PRACTICE");
  assert.equal(practice.length, 1);
  assert.equal(practice[0].date, "2026-09-15");
});

test("(b) lesson done yesterday, mastery 80: practice is still placed", () => {
  const out = planWindow(input({
    today: "2026-09-15",
    state: states({ a1: 80 }),
    completedUnits: lessonYesterday,
  }));
  const mine = out.items.filter((i) => i.topicId === "a1");
  assert.equal(mine.filter((i) => i.activityType === "LESSON").length, 0);
  assert.deepEqual(mine.filter((i) => i.activityType === "PRACTICE").map((i) => i.date), ["2026-09-15"]);
});

test("(b') once the practice is done too, a mastered topic leaves the plan", () => {
  const out = planWindow(input({
    today: "2026-09-16",
    state: states({ a1: 80 }),
    completedUnits: new Map([["a1", { lessons: 1, practices: 1, lastLessonDate: "2026-09-14" }]]),
  }));
  assert.equal(out.items.filter((i) => i.topicId === "a1").length, 0);
});

test("(c) yesterday's lesson's revision passes land on their +3 and +7 days", () => {
  const out = planWindow(input({
    today: "2026-09-15",
    state: states({ a1: 55 }),
    completedUnits: lessonYesterday,
  }));
  const revisions = out.items.filter((i) => i.topicId === "a1" && i.activityType === "REVISION");
  const byNote = (offset: number) => revisions.find((r) => r.notes?.endsWith(`(+${offset}d)`));
  // +1 is due today but today's only slot is the practice, so it moves to tomorrow.
  assert.equal(byNote(1)?.date, "2026-09-16");
  assert.equal(byNote(3)?.date, "2026-09-17");
  assert.equal(byNote(7)?.date, "2026-09-21");
  assert.equal(byNote(14)?.date, "2026-09-28");
});

test("revision passes that fell before the window are not re-created", () => {
  const out = planWindow(input({
    today: "2026-09-20",
    state: states({ a1: 55 }),
    completedUnits: new Map([["a1", { lessons: 1, practices: 1, lastLessonDate: "2026-09-14" }]]),
  }));
  const notes = out.items.filter((i) => i.activityType === "REVISION").map((i) => i.notes);
  assert.deepEqual(notes, ["Revision pass — Topic a1 (+7d)", "Revision pass — Topic a1 (+14d)"]);
});

test("completedUnitsFrom merges lesson and practice groups per topic", () => {
  const units = completedUnitsFrom([
    { topicId: "a1", activityType: "LESSON", count: 2, lastDate: "2026-09-12" },
    { topicId: "a1", activityType: "PRACTICE", count: 1, lastDate: "2026-09-13" },
    { topicId: "b1", activityType: "PRACTICE", count: 1, lastDate: "2026-09-10" },
  ]);
  assert.deepEqual(units.get("a1"), { lessons: 2, practices: 1, lastLessonDate: "2026-09-12" });
  assert.deepEqual(units.get("b1"), { lessons: 0, practices: 1, lastLessonDate: null });
});

test("inProgressTopics: a lesson done with practice outstanding", () => {
  const units = new Map<string, CompletedUnits>([
    ["weak", { lessons: 1, practices: 1, lastLessonDate: "2026-09-12" }], // mastery 30 needs 2
    ["strong", { lessons: 1, practices: 1, lastLessonDate: "2026-09-12" }], // mastery 80 needs 1
    ["practiceOnly", { lessons: 0, practices: 0, lastLessonDate: null }],
  ]);
  const set = inProgressTopics(units, states({ weak: 30, strong: 80 }));
  assert.deepEqual([...set], ["weak"]);
});
