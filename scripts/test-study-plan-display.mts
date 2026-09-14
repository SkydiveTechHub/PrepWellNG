import { test } from "node:test";
import assert from "node:assert/strict";
import { groupWindow, planItemHref } from "../src/lib/study-plan-display";

const subject = { slug: "mathematics" };

test("planItemHref sends each activity to the page that completes it", () => {
  assert.equal(planItemHref({ activityType: "LESSON", topicSlug: "sets", subject }), "/classroom/mathematics/sets/study");
  assert.equal(planItemHref({ activityType: "PRACTICE", topicSlug: "sets", subject }), "/classroom/mathematics/sets/practice");
  assert.equal(planItemHref({ activityType: "REVISION", topicSlug: "sets", subject }), "/classroom/mathematics/sets/quiz");
  assert.equal(planItemHref({ activityType: "REVISION", topicSlug: null, subject }), "/flashcards");
  assert.equal(planItemHref({ activityType: "PAST_QUESTIONS", topicSlug: null, subject }), "/practice/past-questions/mathematics");
  assert.equal(planItemHref({ activityType: "MOCK_EXAM", topicSlug: null, subject }), "/practice/mock-exam");
});

test("groupWindow splits today, recent misses, this week, next week and later", () => {
  const items = [
    { id: "m", date: "2026-09-11", status: "MISSED" },
    { id: "d", date: "2026-09-12", status: "COMPLETED" },
    { id: "a", date: "2026-09-16", status: "PENDING" },
    { id: "t", date: "2026-09-16", status: "COMPLETED" },
    { id: "b", date: "2026-09-18", status: "PENDING" },
    { id: "c", date: "2026-09-20", status: "PENDING" },
    { id: "n", date: "2026-09-22", status: "PENDING" },
    { id: "s", date: "2026-09-27", status: "PENDING" },
    // A window planned on Wednesday 16th runs to Tuesday 29th.
    { id: "l1", date: "2026-09-28", status: "PENDING" },
    { id: "l2", date: "2026-09-29", status: "PENDING" },
  ];
  const g = groupWindow(items, "2026-09-16");
  assert.deepEqual(g.today.map((i) => i.id), ["a", "t"]);
  assert.deepEqual(g.recentMissed.map((i) => i.id), ["m"]);
  assert.deepEqual(g.thisWeek.map((d) => d.date), ["2026-09-18", "2026-09-20"]);
  assert.deepEqual(g.nextWeek.map((d) => d.date), ["2026-09-22", "2026-09-27"]);
  assert.deepEqual(g.later.map((d) => d.date), ["2026-09-28", "2026-09-29"]);
});

test("groupWindow planned on a Monday has nothing later", () => {
  const g = groupWindow([{ date: "2026-09-27", status: "PENDING" }], "2026-09-14");
  assert.deepEqual(g.nextWeek.map((d) => d.date), ["2026-09-27"]);
  assert.deepEqual(g.later, []);
});
