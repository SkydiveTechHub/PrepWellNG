import { test } from "node:test";
import assert from "node:assert/strict";
import { buildLessonUpdate, isAuthored, SYSTEM_AUTHOR } from "../src/lib/admin-lesson";
import { validateLessonMarkdown } from "../src/lib/lesson-markdown";

const GOOD = [
  "## What the law says",
  "",
  "An object stays at rest unless a net force acts on it.",
  "",
  ":::check",
  "Q: What is the net force on a car at constant velocity?",
  "A) Zero",
  "B) Its weight",
  "Correct: A",
  "Why: No acceleration means no net force.",
  ":::",
].join("\n");

test("the update carries blocks, the raw markdown, and the admin as author", () => {
  const parsed = validateLessonMarkdown(GOOD);
  const update = buildLessonUpdate(parsed, GOOD, "admin-123");
  assert.equal(update.blocks.length, 2);
  assert.equal(update.content, GOOD);
  assert.equal(update.createdBy, "admin-123");
});

test("frontmatter keys that are absent are omitted, not written as undefined", () => {
  const parsed = validateLessonMarkdown(GOOD);
  const update = buildLessonUpdate(parsed, GOOD, "admin-123");
  assert.equal("title" in update, false);
  assert.equal("estimatedMinutes" in update, false);
  assert.equal("difficulty" in update, false);
});

test("frontmatter keys that are present are written", () => {
  const source = `---\ntitle: Newton I\nestimatedMinutes: 30\ndifficulty: BASIC\npassMarkPercent: 70\npracticeCount: 5\nsummary: A summary.\n---\n\n${GOOD}`;
  const parsed = validateLessonMarkdown(source);
  const update = buildLessonUpdate(parsed, source, "admin-123");
  assert.equal(update.title, "Newton I");
  assert.equal(update.summary, "A summary.");
  assert.equal(update.estimatedMinutes, 30);
  assert.equal(update.difficulty, "BASIC");
  assert.equal(update.passMarkPercent, 70);
  assert.equal(update.practiceCount, 5);
});

test("subject and topic routing keys never reach the update", () => {
  const source = `---\nsubject: physics\ntopic: newtons-laws\n---\n\n${GOOD}`;
  const parsed = validateLessonMarkdown(source);
  const update = buildLessonUpdate(parsed, source, "admin-123");
  assert.equal("subject" in update, false);
  assert.equal("topic" in update, false);
});

test("seeded lessons are not authored; uploaded ones are", () => {
  assert.equal(isAuthored(SYSTEM_AUTHOR), false);
  assert.equal(isAuthored(null), false);
  assert.equal(isAuthored("admin-123"), true);
});
