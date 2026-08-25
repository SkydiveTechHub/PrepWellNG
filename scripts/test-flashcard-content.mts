import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { generateCardsFromLesson } from "../src/lib/flashcard-content";
import { parseLessonMarkdown } from "../src/lib/lesson-markdown";
import type { LessonBlock } from "../src/lib/lesson-engine";

const FIXTURE = readFileSync(
  fileURLToPath(new URL("./fixtures/measurement-and-units.md", import.meta.url)),
  "utf8",
);

function cardsFor(blocks: LessonBlock[]) {
  return generateCardsFromLesson({ title: "T", blocks }).cards;
}

function concept(partial: Partial<Extract<LessonBlock, { type: "concept" }>>) {
  return { type: "concept", id: "c-1", text: "", ...partial } as LessonBlock;
}

test("lesson scaffolding does not become flashcards", () => {
  const cards = cardsFor([
    concept({
      id: "objectives-1",
      title: "Learning Objectives",
      text: "By the end of this lesson, students should be able to:\n1. Define measurement",
    }),
    concept({ id: "res-1", title: "Recommended Resources", text: "- Some book by Someone" }),
    concept({ id: "real-1", title: "What is Measurement?", text: "Comparing a quantity to a standard." }),
  ]);
  assert.equal(cards.length, 1, "only the teachable concept should produce a card");
  assert.equal(cards[0].prompt, "What is Measurement?");
});

test("an objectives list is skipped even under a different heading", () => {
  const cards = cardsFor([
    concept({
      id: "obj-1",
      title: "Objectives",
      text: "By the end of this lesson, students should be able to:\n1. Do a thing",
    }),
  ]);
  assert.deepEqual(cards, []);
});

test("heading numbering is stripped from the card's term", () => {
  const cards = cardsFor([
    concept({ id: "c-1", title: "2. Fundamental (Base) Quantities", text: "Seven of them." }),
  ]);
  assert.equal(cards[0].prompt, "Fundamental (Base) Quantities");
});

test("a short-answer question becomes a question card, not a term/definition duplicate", () => {
  // Previously term AND definition were both the question text, with the real
  // answer demoted to an "Example:" box -- a card whose back repeated its front.
  const cards = cardsFor([
    concept({ id: "sa-1", text: "Convert 3,000 g to kilograms.", reveal: "3 kg" }),
  ]);
  assert.equal(cards.length, 1);
  const card = cards[0];
  assert.equal(card.cardType, "SCENARIO");
  assert.equal(card.prompt, "Convert 3,000 g to kilograms.");
  const payload = card.payload as { question: string; answer: string };
  assert.equal(payload.question, "Convert 3,000 g to kilograms.");
  assert.equal(payload.answer, "3 kg", "the back must carry the answer, not the question again");
});

test("a theory question with no sample answer produces no card", () => {
  // A flashcard needs something to check against. Keeping it would create a
  // card whose back is blank.
  const cards = cardsFor([concept({ id: "theory-1", text: "Define acceleration in your own words." })]);
  assert.deepEqual(cards, []);
});

test("the real lesson note generates no scaffolding cards", () => {
  const blocks = parseLessonMarkdown(FIXTURE).blocks;
  const cards = generateCardsFromLesson({ title: "Measurement and Units", blocks }).cards;
  const prompts = cards.map((c) => c.prompt);
  assert.ok(
    !prompts.includes("Learning Objectives"),
    `Learning Objectives leaked into the deck: ${prompts.join(" | ")}`,
  );
  assert.ok(
    !prompts.includes("Recommended Resources"),
    `Recommended Resources leaked into the deck: ${prompts.join(" | ")}`,
  );
});

test("no generated card repeats its prompt as its whole answer", () => {
  const blocks = parseLessonMarkdown(FIXTURE).blocks;
  const cards = generateCardsFromLesson({ title: "Measurement and Units", blocks }).cards;
  for (const card of cards) {
    const payload = card.payload as Record<string, unknown>;
    const back = String(payload.definition ?? payload.answer ?? "");
    assert.notEqual(
      back.trim(),
      card.prompt.trim(),
      `card "${card.prompt}" shows the same text on both sides`,
    );
  }
});

test("each card records the id of the block that produced it", () => {
  const cards = cardsFor([
    concept({ id: "c-alpha", title: "Density", text: "Mass per unit volume." }),
    { type: "mistake", id: "m-beta", wrong: "Mass is weight.", right: "Weight is a force." } as LessonBlock,
    { type: "tip", id: "t-gamma", text: "Always convert to SI first." } as LessonBlock,
  ]);
  assert.deepEqual(
    cards.map((c) => c.sourceKey),
    ["c-alpha", "m-beta", "t-gamma"],
  );
});

test("source keys are unique across a generated deck", () => {
  const blocks = [
    concept({ id: "c-1", title: "One", text: "First." }),
    concept({ id: "c-2", title: "Two", text: "Second." }),
    concept({ id: "c-3", title: "Three", text: "Third." }),
  ];
  const keys = cardsFor(blocks).map((c) => c.sourceKey);
  assert.equal(new Set(keys).size, keys.length);
});

test("a skipped block contributes no source key", () => {
  const cards = cardsFor([
    concept({ id: "objectives-1", title: "Learning Objectives", text: "By the end of this lesson, students should be able to:\n1. Define x" }),
    concept({ id: "c-real", title: "Real Content", text: "Something teachable." }),
  ]);
  assert.deepEqual(cards.map((c) => c.sourceKey), ["c-real"]);
});
