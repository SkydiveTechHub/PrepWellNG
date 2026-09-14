import { test } from "node:test";
import assert from "node:assert/strict";
import {
  REMINDER_PAGE_SIZE,
  buildMorningDigest,
  buildStreakReminder,
  lagosDayEnd,
  lagosDayStart,
  planDateFor,
  streakToRemind,
  type DigestPlanItem,
} from "../src/lib/push-reminders";
import { lagosDayKey } from "../src/lib/streak";

const item = (topicName: string | null, subjectName: string, durationMinutes: number): DigestPlanItem => ({
  topicName,
  subjectName,
  durationMinutes,
});

test("nothing planned and nothing due sends nothing", () => {
  assert.equal(buildMorningDigest({ planItems: [], dueCards: 0 }), null);
});

test("plan and cards together", () => {
  const message = buildMorningDigest({
    planItems: [item("Photosynthesis", "Biology", 30), item("Vectors", "Physics", 20), item(null, "English", 10)],
    dueCards: 12,
  });
  assert.deepEqual(message, {
    title: "Today's study plan",
    body: "Today: 3 topics · 60 min, and 12 flashcards due",
    url: "/study-plan",
  });
});

test("singular forms", () => {
  const message = buildMorningDigest({ planItems: [item("Vectors", "Physics", 25)], dueCards: 1 });
  assert.equal(message?.body, "Today: 1 topic · 25 min, and 1 flashcard due");
});

test("plan only names the first topic, or its subject when there is no topic", () => {
  assert.equal(
    buildMorningDigest({ planItems: [item("Photosynthesis", "Biology", 30), item("Cells", "Biology", 30)], dueCards: 0 })?.body,
    "Today's plan: Photosynthesis + 1 more (60 min)",
  );
  assert.equal(
    buildMorningDigest({ planItems: [item(null, "Mathematics", 45)], dueCards: 0 })?.body,
    "Today's plan: Mathematics (45 min)",
  );
  assert.equal(buildMorningDigest({ planItems: [item(null, "Mathematics", 45)], dueCards: 0 })?.url, "/study-plan");
});

test("cards only", () => {
  assert.deepEqual(buildMorningDigest({ planItems: [], dueCards: 12 }), {
    title: "Flashcards due",
    body: "12 flashcards are due for review",
    url: "/flashcards",
  });
  assert.equal(buildMorningDigest({ planItems: [], dueCards: 1 })?.body, "1 flashcard is due for review");
});

test("a very long topic name stays within the body limit", () => {
  const message = buildMorningDigest({ planItems: [item("x".repeat(400), "Biology", 30)], dueCards: 0 });
  assert.ok(message && message.body.length <= 180);
});

test("streak reminder needs at least two days ending yesterday and nothing today", () => {
  const today = "2026-09-15";
  assert.equal(streakToRemind(["2026-09-14", "2026-09-13", "2026-09-12"], today), 3);
  assert.equal(streakToRemind(["2026-09-14", "2026-09-13"], today), 2);
  assert.equal(streakToRemind(["2026-09-14"], today), null, "a 1-day streak is not worth a nudge");
  assert.equal(streakToRemind(["2026-09-15", "2026-09-14", "2026-09-13"], today), null, "already practised today");
  assert.equal(streakToRemind(["2026-09-13", "2026-09-12"], today), null, "already broken yesterday");
  assert.equal(streakToRemind([], today), null);
});

test("streak copy", () => {
  assert.deepEqual(buildStreakReminder(6), {
    title: "Keep your streak going",
    body: "Keep your 6-day streak: one quick practice before midnight",
    url: "/practice",
  });
});

test("Lagos day bounds are UTC+1", () => {
  assert.equal(lagosDayStart("2026-09-15").toISOString(), "2026-09-14T23:00:00.000Z");
  assert.equal(lagosDayEnd("2026-09-15").toISOString(), "2026-09-15T23:00:00.000Z");
  // 23:30 UTC on the 14th is 00:30 on the 15th in Lagos: inside the day.
  const lateNight = new Date("2026-09-14T23:30:00.000Z");
  assert.equal(lagosDayKey(lateNight), "2026-09-15");
  assert.ok(lateNight >= lagosDayStart("2026-09-15") && lateNight < lagosDayEnd("2026-09-15"));
});

test("plan dates are stored as UTC midnight of the day key", () => {
  assert.equal(planDateFor("2026-09-15").toISOString(), "2026-09-15T00:00:00.000Z");
});

test("page size", () => {
  assert.equal(REMINDER_PAGE_SIZE, 200);
});
