import { test } from "node:test";
import assert from "node:assert/strict";
import { buildGraph, type GraphEdge } from "../src/engines/learning/graph";
import type { TopicState, TopicStateMap } from "../src/engines/learning/mastery";
import { buildSlots, dayBudget, type Availability } from "../src/engines/planner/slots";
import { daysBetween } from "../src/engines/planner/days";
import {
  layoutWindow,
  type LayoutInput,
  type WindowItemDraft,
} from "../src/engines/planner/layout";
import type { PlanTopic, SubjectSelection, TopicCandidate } from "../src/engines/planner/topics";

const START = "2026-09-14"; // Monday
const EVERY_DAY_30: Availability = { studyDays: [1, 2, 3, 4, 5, 6, 7], weekdayMinutes: 30, weekendMinutes: 30 };

function topic(id: string, overrides: Partial<PlanTopic> = {}): PlanTopic {
  return {
    id, subjectId: "maths", title: `Topic ${id}`, slug: id, orderIndex: 0, estimatedMinutes: 30,
    waecWeight: 0, jambWeight: 0, prerequisiteTopicId: null, classLevel: "SS1", term: "FIRST",
    ...overrides,
  };
}

function cand(t: PlanTopic, reason: TopicCandidate["reason"] = "CURRENT", carriedFrom: string | null = null): TopicCandidate {
  return { topic: t, reason, carriedFrom, unlocks: null };
}

function selection(subjectId: string, candidates: TopicCandidate[], behindBy = 0): SubjectSelection {
  return { subjectId, termTopics: candidates.map((c) => c.topic), classIndex: 0, behindBy, candidates };
}

function states(entries: Record<string, number>): TopicStateMap {
  return new Map(Object.entries(entries).map(([id, mastery]) => [id, { topicId: id, mastery } as unknown as TopicState]));
}

function layout(overrides: Partial<LayoutInput> & { availability?: Availability; days?: number } = {}) {
  const { availability = EVERY_DAY_30, days = 14, ...rest } = overrides;
  const selections = rest.selections ?? [];
  const topics = selections.flatMap((s) => s.candidates.map((c) => c.topic));
  return layoutWindow({
    mode: "TERM",
    slots: buildSlots(START, days, availability),
    targetDate: null,
    runwayStart: null,
    selections,
    examCandidates: [],
    subjectIds: selections.map((s) => s.subjectId),
    subjectNames: {},
    graph: buildGraph(topics, []),
    state: states({}),
    pretestPassed: new Set(),
    revisionDue: [],
    fixed: [],
    ...rest,
  });
}

const of = (items: WindowItemDraft[], type: string) => items.filter((i) => i.activityType === type);

test("never schedules more than a day's budget, including fixed sessions", () => {
  const availability: Availability = { studyDays: [1, 2, 3, 4, 6], weekdayMinutes: 45, weekendMinutes: 120 };
  const topics = [1, 2, 3, 4, 5, 6].map((n) => topic(`t${n}`, { orderIndex: n, estimatedMinutes: 60 }));
  const { items } = layout({
    availability,
    selections: [selection("maths", topics.map((t) => cand(t)))],
    fixed: [{ date: START, subjectId: "maths", durationMinutes: 30 }],
  });
  const perDay = new Map<string, number>([[START, 30]]);
  for (const i of items) perDay.set(i.date, (perDay.get(i.date) ?? 0) + i.durationMinutes);
  for (const [date, minutes] of perDay) assert.ok(minutes <= dayBudget(date, availability), `${date}: ${minutes}`);
});

test("lesson, then practice on a later day, then spaced revision", () => {
  const t = topic("t1");
  const { items } = layout({ selections: [selection("maths", [cand(t)])] });
  const lesson = of(items, "LESSON");
  const practice = of(items, "PRACTICE");
  const revision = of(items, "REVISION");
  assert.equal(lesson.length, 1);
  assert.equal(practice.length, 2); // mastery 0 < 50 → two practice sessions
  assert.ok(practice.every((p) => p.date > lesson[0].date));
  // +1, +3, +7 fall inside 14 days; +14 does not.
  assert.equal(revision.length, 3);
  const offsets = [1, 3, 7];
  revision.forEach((r, i) => assert.ok(daysBetween(lesson[0].date, r.date) >= offsets[i]));
});

test("a passed pretest skips lessons", () => {
  const t = topic("t1");
  const { items } = layout({ selections: [selection("maths", [cand(t)])], pretestPassed: new Set(["t1"]) });
  assert.equal(of(items, "LESSON").length, 0);
  assert.ok(of(items, "PRACTICE").length > 0);
});

test("a dependent topic waits for its prerequisite's lessons", () => {
  const a = topic("a", { estimatedMinutes: 60 });
  const b = topic("b", { orderIndex: 1 });
  const edge: GraphEdge = { id: "a->b", from: "a", to: "b", kind: "PREREQUISITE", strength: 1, rationale: null };
  const { items } = layout({
    selections: [selection("maths", [cand(b), cand(a, "CATCH_UP")])],
    graph: buildGraph([a, b], [edge]),
  });
  const lastLessonA = of(items, "LESSON").filter((i) => i.topicId === "a").at(-1)!;
  const firstB = items.find((i) => i.topicId === "b")!;
  assert.ok(firstB.date > lastLessonA.date);
});

test("at most two subjects on a weekday and three on a weekend day", () => {
  const availability: Availability = { studyDays: [1, 2, 3, 4, 5, 6, 7], weekdayMinutes: 150, weekendMinutes: 150 };
  const subjects = ["a", "b", "c", "d"].map((s) =>
    selection(s, [1, 2, 3].map((n) => cand(topic(`${s}${n}`, { subjectId: s, orderIndex: n, estimatedMinutes: 60 })))),
  );
  const { items } = layout({ availability, selections: subjects });
  const perDay = new Map<string, Set<string>>();
  for (const i of items) perDay.set(i.date, (perDay.get(i.date) ?? new Set()).add(i.subjectId));
  for (const [date, set] of perDay) {
    const weekend = ["2026-09-19", "2026-09-20", "2026-09-26", "2026-09-27"].includes(date);
    assert.ok(set.size <= (weekend ? 3 : 2), `${date}: ${[...set].join(",")}`);
  }
});

test("the catch-up slot takes carry-over and marks where it came from", () => {
  const availability: Availability = { studyDays: [1, 2, 3, 4, 5, 6, 7], weekdayMinutes: 0, weekendMinutes: 60 };
  const missed = topic("missed");
  const current = topic("current", { orderIndex: 1 });
  const { items } = layout({
    availability,
    selections: [selection("maths", [cand(missed, "CARRY_OVER", "2026-09-10"), cand(current)])],
  });
  // First study slot of the week is Sunday's first slot (last study day = Sunday).
  const saturday = items.filter((i) => i.date === "2026-09-19");
  assert.equal(saturday[0].topicId, "current");
  const sunday = items.filter((i) => i.date === "2026-09-20");
  assert.equal(sunday[0].topicId, "missed");
  assert.equal(sunday[0].carriedFrom, "2026-09-10");
});

test("term mode never schedules past questions or mocks", () => {
  const { items } = layout({ selections: [selection("maths", [cand(topic("t1"))])] });
  assert.equal(of(items, "PAST_QUESTIONS").length + of(items, "MOCK_EXAM").length, 0);
});

test("blended runway: a mock on the runway start, then revision and past questions", () => {
  const { items } = layout({
    mode: "BLENDED",
    availability: { studyDays: [1, 2, 3, 4, 5, 6, 7], weekdayMinutes: 60, weekendMinutes: 60 },
    targetDate: "2026-09-27",
    runwayStart: "2026-09-14",
    selections: [selection("maths", [cand(topic("t1"))])],
    subjectIds: ["maths"],
    subjectNames: { maths: "Mathematics" },
  });
  assert.equal(items[0].activityType, "MOCK_EXAM");
  assert.equal(items[0].date, START);
  assert.equal(items[0].durationMinutes, 60);
  assert.equal(of(items, "MOCK_EXAM").length, 2);
  assert.equal(of(items, "LESSON").length, 0);
  assert.ok(of(items, "PAST_QUESTIONS").every((i) => i.notes === "Past questions — Mathematics"));
});

test("exam mode before the runway fills slots with exam practice and past questions", () => {
  const exam = [1, 2, 3].map((n) => cand(topic(`e${n}`, { orderIndex: n }), "EXAM"));
  const { items } = layout({
    mode: "EXAM",
    targetDate: "2027-03-01",
    runwayStart: "2027-02-10",
    examCandidates: exam,
    subjectIds: ["maths"],
  });
  assert.ok(items.length > 0);
  assert.ok(items.every((i) => ["PRACTICE", "PAST_QUESTIONS", "REVISION"].includes(i.activityType)));
  assert.ok(of(items, "PAST_QUESTIONS").length > 0);
});

test("gap-fill takes at most 20% of the window", () => {
  const gaps = [1, 2, 3, 4, 5, 6].map((n) => cand(topic(`g${n}`, { orderIndex: n, estimatedMinutes: 90 }), "GAP_FILL"));
  const current = cand(topic("cur", { orderIndex: 10, estimatedMinutes: 90 }));
  const { items } = layout({ selections: [selection("maths", [...gaps, current])] });
  const gapMinutes = items
    .filter((i) => i.topicId?.startsWith("g") && i.activityType !== "REVISION")
    .reduce((n, i) => n + i.durationMinutes, 0);
  assert.ok(gapMinutes <= 14 * 30 * 0.2, `gap minutes ${gapMinutes}`);
});

test("too much work for the time reports overload instead of cramming", () => {
  const topics = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => cand(topic(`t${n}`, { orderIndex: n, estimatedMinutes: 60 }), "CATCH_UP"));
  const { overload } = layout({ selections: [selection("maths", topics)] });
  assert.ok(overload);
  assert.ok(overload.topicsBehind > 0);
  assert.equal(overload.suggestedExtraMinutesPerWeek % 30, 0);
});

test("preview topics never cause overload", () => {
  const previews = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => cand(topic(`p${n}`, { orderIndex: n, estimatedMinutes: 60 }), "PREVIEW"));
  assert.equal(layout({ selections: [selection("maths", previews)] }).overload, null);
});
