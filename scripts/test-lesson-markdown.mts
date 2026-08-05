import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLessonMarkdown } from "../src/lib/lesson-markdown";
import type { ConceptBlock } from "../src/lib/lesson-engine";

test("a bare heading and paragraph become one concept block", () => {
  const result = parseLessonMarkdown(
    "## What is photosynthesis?\n\nGreen plants use light energy.",
  );
  assert.deepEqual(result.errors, []);
  assert.equal(result.blocks.length, 1);
  const block = result.blocks[0] as ConceptBlock;
  assert.equal(block.type, "concept");
  assert.equal(block.title, "What is photosynthesis?");
  assert.equal(block.text, "Green plants use light energy.");
  assert.equal(block.id, "what-is-photosynthesis-1");
});

test("frontmatter is parsed and stripped from the body", () => {
  const result = parseLessonMarkdown(
    [
      "---",
      "title: Photosynthesis",
      "summary: How plants make food.",
      "estimatedMinutes: 25",
      "difficulty: INTERMEDIATE",
      "subject: biology",
      "topic: photosynthesis",
      "---",
      "",
      "## Overview",
      "",
      "Body text.",
    ].join("\n"),
  );
  assert.equal(result.meta.title, "Photosynthesis");
  assert.equal(result.meta.summary, "How plants make food.");
  assert.equal(result.meta.estimatedMinutes, 25);
  assert.equal(result.meta.difficulty, "INTERMEDIATE");
  assert.equal(result.meta.subject, "biology");
  assert.equal(result.meta.topic, "photosynthesis");
  assert.equal(result.blocks.length, 1);
  assert.equal((result.blocks[0] as ConceptBlock).title, "Overview");
});

test("a file with no frontmatter parses fine", () => {
  const result = parseLessonMarkdown("## A\n\nText.");
  assert.deepEqual(result.meta, {});
  assert.deepEqual(result.errors, []);
});

test("an unknown frontmatter key warns but does not fail", () => {
  const result = parseLessonMarkdown(
    "---\ntitle: A\nkeyPoints: nope\n---\n\n## A\n\nText.",
  );
  assert.deepEqual(result.errors, []);
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0].message, /keyPoints/);
});

test("a non-numeric estimatedMinutes is an error, not a silent zero", () => {
  const result = parseLessonMarkdown(
    "---\nestimatedMinutes: soon\n---\n\n## A\n\nText.",
  );
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0].message, /estimatedMinutes/);
});

test("an out-of-range difficulty is an error", () => {
  const result = parseLessonMarkdown(
    "---\ndifficulty: EASY\n---\n\n## A\n\nText.",
  );
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0].message, /difficulty/);
});

test("a single-hash heading supplies the title when frontmatter omits it", () => {
  const result = parseLessonMarkdown("# Photosynthesis\n\n## Overview\n\nText.");
  assert.equal(result.meta.title, "Photosynthesis");
});

test("frontmatter title wins over a single-hash heading", () => {
  const result = parseLessonMarkdown(
    "---\ntitle: From frontmatter\n---\n\n# From heading\n\n## A\n\nText.",
  );
  assert.equal(result.meta.title, "From frontmatter");
});

test("### Reveal inside a concept becomes the reveal field", () => {
  const result = parseLessonMarkdown(
    "## Osmosis\n\nWater moves down a gradient.\n\n### Reveal\n\nThe membrane must be partially permeable.",
  );
  assert.equal(result.blocks.length, 1);
  const block = result.blocks[0] as ConceptBlock;
  assert.equal(block.text, "Water moves down a gradient.");
  assert.equal(block.reveal, "The membrane must be partially permeable.");
});

test("multiple headings produce blocks in document order with unique ids", () => {
  const result = parseLessonMarkdown("## First\n\nA.\n\n## Second\n\nB.");
  assert.equal(result.blocks.length, 2);
  assert.equal(result.blocks[0].id, "first-1");
  assert.equal(result.blocks[1].id, "second-1");
});

test("two headings with the same text get distinct ids", () => {
  const result = parseLessonMarkdown("## Same\n\nA.\n\n## Same\n\nB.");
  assert.notEqual(result.blocks[0].id, result.blocks[1].id);
});

test("an empty document is an error rather than an empty success", () => {
  const result = parseLessonMarkdown("   \n\n  ");
  assert.equal(result.blocks.length, 0);
  assert.equal(result.errors.length, 1);
});
