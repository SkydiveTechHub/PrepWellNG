import { test } from "node:test";
import assert from "node:assert/strict";
import { buildGraph } from "../src/engines/learning/graph";
import type { TermContext } from "../src/engines/planner/term-context";
import type { PlanTopic } from "../src/engines/planner/topics";
import { planWindow, type PlannerInput } from "../src/engines/planner/term-plan";
import { projectOutline } from "../src/engines/planner/outline";

function topic(id: string, overrides: Partial<PlanTopic> = {}): PlanTopic {
  return {
    id, subjectId: "maths", title: `Topic ${id}`, slug: id, orderIndex: 0, estimatedMinutes: 45,
    waecWeight: 1, jambWeight: 1, prerequisiteTopicId: null, classLevel: "SS1", term: "FIRST",
    ...overrides,
  };
}

const FIRST_TERM: TermContext = {
  kind: "in_term",
  source: "configured",
  current: { session: "2026/2027", term: "FIRST", startsOn: "2026-09-07", endsOn: "2026-11-29" },
  weekOfTerm: 2,
  totalWeeks: 12,
  weeksLeft: 10,
};

const ss1 = [1, 2, 3, 4, 5, 6].map((n) => topic(`a${n}`, { orderIndex: n }));
const ss2 = [1, 2].map((n) => topic(`b${n}`, { classLevel: "SS2", orderIndex: n }));
const ss3 = [1, 2].map((n) => topic(`c${n}`, { classLevel: "SS3", orderIndex: n }));

function input(overrides: Partial<PlannerInput> = {}): PlannerInput {
  const topics = [...ss1, ...ss2, ...ss3];
  return {
    today: "2026-09-14",
    planStart: "2026-09-14",
    mode: "TERM",
    classLevel: "SS1",
    targetDate: null,
    termContext: FIRST_TERM,
    availability: { studyDays: [1, 2, 3, 4, 6], weekdayMinutes: 30, weekendMinutes: 60 },
    subjects: [{ id: "maths", name: "Mathematics", topics }],
    graph: buildGraph(topics, []),
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

test("an SS1 term plan covers 14 days with SS1 topics only and no exam work", () => {
  const out = planWindow(input());
  assert.equal(out.plannedThrough, "2026-09-27");
  assert.ok(out.items.length > 0);
  const ids = new Set(out.items.map((i) => i.topicId));
  for (const t of [...ss2, ...ss3]) assert.equal(ids.has(t.id), false);
  assert.equal(out.items.some((i) => i.activityType === "PAST_QUESTIONS" || i.activityType === "MOCK_EXAM"), false);
  assert.equal(out.runwayStart, null);
});

test("an SS3 plan 10 days from the exam is all runway and ends on the exam day", () => {
  const out = planWindow(input({
    classLevel: "SS3",
    mode: "BLENDED",
    targetDate: "2026-09-23",
    planStart: "2026-08-01",
  }));
  assert.equal(out.plannedThrough, "2026-09-23");
  // 2026-08-01 → 2026-09-23 is 54 days; 20% rounds to 11, clamped up to 14.
  assert.equal(out.runwayStart, "2026-09-10");
  assert.ok(out.items.some((i) => i.activityType === "MOCK_EXAM"));
  assert.ok(out.items.every((i) => i.date <= "2026-09-23"));
});

// resolvePlanMode now turns a passed exam date into TERM, so the app never asks
// for this; planWindow still has to behave if called with it directly.
test("a passed exam date plans nothing", () => {
  const out = planWindow(input({ classLevel: "SS3", mode: "BLENDED", targetDate: "2026-09-01" }));
  assert.deepEqual(out.items, []);
  assert.equal(out.plannedThrough, "2026-09-14");
});

test("projectOutline paces the class through the term after the window", () => {
  const out = planWindow(input());
  assert.ok(out.outline.length > 0);
  assert.equal(out.outline[0].weekStart, "2026-09-28");
  assert.ok(out.outline.every((w) => w.weekStart <= "2026-11-29"));
  assert.equal(out.outline.at(-1)!.topics[0].title, "Topic a6");
});

test("projectOutline labels runway weeks and has nothing in a holiday", () => {
  const weeks = projectOutline({
    today: "2026-09-14",
    from: "2026-09-28",
    until: "2026-10-25",
    mode: "BLENDED",
    runwayStart: "2026-10-12",
    termContext: FIRST_TERM,
    selections: [],
  });
  assert.equal(weeks.at(-1)!.label, "Exam runway — mocks and past questions");
  const holiday = projectOutline({
    today: "2026-12-20",
    from: "2027-01-04",
    until: null,
    mode: "TERM",
    runwayStart: null,
    termContext: { kind: "holiday", source: "configured", previous: null, next: null },
    selections: [],
  });
  assert.deepEqual(holiday, []);
});
