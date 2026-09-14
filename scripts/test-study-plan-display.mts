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

test("groupWindow splits today, recent misses, this week and next week", () => {
  const items = [
    { id: "m", date: "2026-09-11", status: "MISSED" },
    { id: "d", date: "2026-09-12", status: "COMPLETED" },
    { id: "a", date: "2026-09-16", status: "PENDING" },
    { id: "t", date: "2026-09-16", status: "COMPLETED" },
    { id: "b", date: "2026-09-18", status: "PENDING" },
    { id: "c", date: "2026-09-20", status: "PENDING" },
    { id: "n", date: "2026-09-22", status: "PENDING" },
  ];
  const g = groupWindow(items, "2026-09-16");
  assert.deepEqual(g.today.map((i) => i.id), ["a", "t"]);
  assert.deepEqual(g.recentMissed.map((i) => i.id), ["m"]);
  assert.deepEqual(g.thisWeek.map((d) => d.date), ["2026-09-18", "2026-09-20"]);
  assert.deepEqual(g.nextWeek.map((d) => d.date), ["2026-09-22"]);
});
