import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLessonMarkdown } from "../src/lib/lesson-markdown";
import type { ConceptBlock } from "../src/lib/lesson-engine";
import type {
  ExampleBlock,
  TipBlock,
  MistakeBlock,
  MnemonicBlock,
  CheckBlock,
} from "../src/lib/lesson-engine";

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

const LEAD = "## Forces\n\nA force is a push or a pull.\n\n";

test("an example fence becomes an ExampleBlock with ordered steps", () => {
  const result = parseLessonMarkdown(
    LEAD +
      [
        ":::example",
        "Problem: A 4 kg mass is pushed with 20 N. Find the acceleration.",
        "Step: Write F = ma.",
        "Step: Substitute F = 20, m = 4.",
        "Answer: 5 m/s²",
        "Mode: worked",
        ":::",
      ].join("\n"),
  );
  assert.deepEqual(result.errors, []);
  const block = result.blocks[1] as ExampleBlock;
  assert.equal(block.type, "example");
  assert.equal(block.problem, "A 4 kg mass is pushed with 20 N. Find the acceleration.");
  assert.deepEqual(block.steps, ["Write F = ma.", "Substitute F = 20, m = 4."]);
  assert.equal(block.answer, "5 m/s²");
  assert.equal(block.mode, "worked");
});

test("an example with no Mode defaults to worked", () => {
  const result = parseLessonMarkdown(
    LEAD + ":::example\nProblem: P.\nStep: S.\nAnswer: A.\n:::",
  );
  assert.equal((result.blocks[1] as ExampleBlock).mode, "worked");
});

test("an unlabelled line continues the previous field", () => {
  const result = parseLessonMarkdown(
    LEAD + ":::example\nProblem: Line one\nline two.\nStep: S.\nAnswer: A.\n:::",
  );
  assert.equal((result.blocks[1] as ExampleBlock).problem, "Line one\nline two.");
});

test("a tip fence carries prose and an optional exam tag", () => {
  const result = parseLessonMarkdown(
    LEAD + ":::tip\nExam: WAEC\nCheck the units before choosing a formula.\n:::",
  );
  const block = result.blocks[1] as TipBlock;
  assert.equal(block.type, "tip");
  assert.equal(block.text, "Check the units before choosing a formula.");
  assert.equal(block.examType, "WAEC");
});

test("an unrecognised exam tag warns and is dropped rather than stored invalid", () => {
  const result = parseLessonMarkdown(LEAD + ":::tip\nExam: GCSE\nSome advice.\n:::");
  assert.deepEqual(result.errors, []);
  assert.equal((result.blocks[1] as TipBlock).examType, undefined);
  assert.equal(result.warnings.length, 1);
});

test("a mistake fence carries wrong and right", () => {
  const result = parseLessonMarkdown(
    LEAD + ":::mistake\nWrong: Adding opposing forces.\nRight: Subtract them, then apply F = ma.\n:::",
  );
  const block = result.blocks[1] as MistakeBlock;
  assert.equal(block.wrong, "Adding opposing forces.");
  assert.equal(block.right, "Subtract them, then apply F = ma.");
});

test("a mnemonic fence keeps encoded lines in order", () => {
  const result = parseLessonMarkdown(
    LEAD + ":::mnemonic\nPhrase: My Very Easy Method\nEncoded: Mercury\nEncoded: Venus\n:::",
  );
  const block = result.blocks[1] as MnemonicBlock;
  assert.equal(block.phrase, "My Very Easy Method");
  assert.deepEqual(block.encoded, ["Mercury", "Venus"]);
});

test("a check fence becomes a CheckBlock with lettered options", () => {
  const result = parseLessonMarkdown(
    LEAD +
      [
        ":::check",
        "Q: What is the SI unit of force?",
        "A) Joule",
        "B) Newton",
        "C) Watt",
        "Correct: B",
        "Why: Force is measured in newtons.",
        ":::",
      ].join("\n"),
  );
  assert.deepEqual(result.errors, []);
  const block = result.blocks[1] as CheckBlock;
  assert.equal(block.type, "check");
  assert.equal(block.question, "What is the SI unit of force?");
  assert.deepEqual(block.options, { A: "Joule", B: "Newton", C: "Watt" });
  assert.equal(block.answer, "B");
  assert.equal(block.explanation, "Force is measured in newtons.");
});

test("a check attaches to the preceding non-check block by default", () => {
  const result = parseLessonMarkdown(
    LEAD + ":::check\nQ: Q?\nA) One\nB) Two\nCorrect: A\nWhy: Because.\n:::",
  );
  assert.equal((result.blocks[1] as CheckBlock).afterCard, result.blocks[0].id);
});

test("an explicit After: overrides the implicit attachment", () => {
  const result = parseLessonMarkdown(
    "## First\n\nA.\n\n## Second\n\nB.\n\n" +
      ":::check\nQ: Q?\nA) One\nB) Two\nCorrect: A\nWhy: Because.\nAfter: first-1\n:::",
  );
  assert.equal((result.blocks[2] as CheckBlock).afterCard, "first-1");
});

test("a check whose Correct names no option is an error", () => {
  const result = parseLessonMarkdown(
    LEAD + ":::check\nQ: Q?\nA) One\nB) Two\nCorrect: D\nWhy: Because.\n:::",
  );
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0].message, /Correct/);
});

test("a check with fewer than two options is an error", () => {
  const result = parseLessonMarkdown(
    LEAD + ":::check\nQ: Q?\nA) Only one\nCorrect: A\nWhy: Because.\n:::",
  );
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0].message, /two/i);
});

test("an unclosed fence is an error naming the line it opened on", () => {
  const result = parseLessonMarkdown(LEAD + ":::example\nProblem: P.");
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0].message, /never closed/i);
  assert.equal(result.errors[0].line, 5);
});

test("an unknown fence type is an error", () => {
  const result = parseLessonMarkdown(LEAD + ":::video\nsrc: x\n:::");
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0].message, /video/);
});

test("a repeated single-value label is an error", () => {
  const result = parseLessonMarkdown(
    LEAD + ":::mistake\nWrong: A.\nWrong: B.\nRight: C.\n:::",
  );
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0].message, /Wrong/);
});

test("a fence interrupts the concept section it sits inside", () => {
  const result = parseLessonMarkdown(
    "## Forces\n\nProse before.\n\n:::tip\nAdvice.\n:::\n\nProse after.",
  );
  assert.equal(result.blocks.length, 3);
  assert.equal(result.blocks[0].type, "concept");
  assert.equal(result.blocks[1].type, "tip");
  assert.equal(result.blocks[2].type, "concept");
});
