import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveClassLevel,
  selectResources,
  toNotes,
  topicNeighbours,
  type TopicNavItem,
} from "../src/lib/classroom";
import type { LessonBlock } from "../src/lib/lesson-engine";

const concept = (id: string): LessonBlock => ({
  type: "concept",
  id,
  title: `Concept ${id}`,
  text: "Body text",
});
const check = (id: string): LessonBlock => ({
  type: "check",
  id,
  question: "Q?",
  options: { A: "a", B: "b" },
  answer: "A",
  explanation: "because",
  afterCard: "c1",
});

// ─── toNotes ───────────────────────────────────────────────

test("toNotes drops check blocks", () => {
  // A knowledge check belongs to the player, where an answer is graded.
  const notes = toNotes([concept("c1"), check("k1"), concept("c2")]);
  assert.deepEqual(notes.map((b) => b.id), ["c1", "c2"]);
});

test("toNotes preserves authored order", () => {
  const notes = toNotes([concept("c3"), concept("c1"), concept("c2")]);
  assert.deepEqual(notes.map((b) => b.id), ["c3", "c1", "c2"]);
});

test("toNotes keeps every non-check type", () => {
  const blocks: LessonBlock[] = [
    concept("c"),
    { type: "diagram", id: "d", svg: "<svg/>", hotspots: [] },
    { type: "example", id: "e", problem: "p", steps: ["s"], answer: "a" },
    { type: "tip", id: "t", text: "tip" },
    { type: "mistake", id: "m", wrong: "w", right: "r" },
    { type: "mnemonic", id: "n", phrase: "p", encoded: ["e"] },
  ];
  assert.equal(toNotes(blocks).length, 6);
});

test("toNotes on an empty list returns empty", () => {
  assert.deepEqual(toNotes([]), []);
});

test("toNotes on checks only returns empty", () => {
  assert.deepEqual(toNotes([check("k1"), check("k2")]), []);
});

// ─── resolveClassLevel ─────────────────────────────────────

test("resolveClassLevel honours the student's own class", () => {
  assert.equal(resolveClassLevel("SS2", ["SS1", "SS2", "SS3"]), "SS2");
});

test("resolveClassLevel falls back when the student's class has no topics", () => {
  assert.equal(resolveClassLevel("SS3", ["SS1", "SS2"]), "SS1");
});

test("resolveClassLevel falls back for junior, absent and unknown values", () => {
  for (const value of ["JSS3", null, undefined, "", "SS4"]) {
    assert.equal(resolveClassLevel(value, ["SS2", "SS3"]), "SS2", `value=${value}`);
  }
});

test("resolveClassLevel returns SS1 when no class has topics", () => {
  assert.equal(resolveClassLevel(null, []), "SS1");
});

test("resolveClassLevel picks the lowest available class, not list order", () => {
  assert.equal(resolveClassLevel(null, ["SS3", "SS1"]), "SS1");
});

// ─── topicNeighbours ───────────────────────────────────────

const topic = (
  slug: string,
  classLevel: string,
  term: string,
  orderIndex: number,
): TopicNavItem => ({ slug, title: slug, classLevel, term, orderIndex });

const SYLLABUS: TopicNavItem[] = [
  topic("a", "SS1", "FIRST", 0),
  topic("b", "SS1", "FIRST", 1),
  topic("c", "SS1", "SECOND", 0),
  topic("d", "SS1", "THIRD", 0),
  topic("e", "SS2", "FIRST", 0),
];

test("topicNeighbours moves within a term by orderIndex", () => {
  const { previous, next } = topicNeighbours(SYLLABUS, "a");
  assert.equal(previous, null);
  assert.equal(next?.slug, "b");
});

test("topicNeighbours carries across a term boundary", () => {
  const { previous, next } = topicNeighbours(SYLLABUS, "b");
  assert.equal(previous?.slug, "a");
  assert.equal(next?.slug, "c");
});

test("topicNeighbours stops at the end of a class", () => {
  // "d" is the last SS1 topic; "e" is SS2 and must not be offered.
  const { previous, next } = topicNeighbours(SYLLABUS, "d");
  assert.equal(previous?.slug, "c");
  assert.equal(next, null);
});

test("topicNeighbours stops at the start of a class", () => {
  const { previous, next } = topicNeighbours(SYLLABUS, "e");
  assert.equal(previous, null);
  assert.equal(next, null);
});

test("topicNeighbours sorts by term before orderIndex", () => {
  // orderIndex deliberately disagrees with term order: sorting by orderIndex
  // alone would put the SECOND-term topic first and pick the wrong neighbour.
  const topics = [
    topic("late-first", "SS1", "FIRST", 9),
    topic("early-second", "SS1", "SECOND", 0),
  ];
  const { next } = topicNeighbours(topics, "late-first");
  assert.equal(next?.slug, "early-second");

  const back = topicNeighbours(topics, "early-second");
  assert.equal(back.previous?.slug, "late-first");
  assert.equal(back.next, null);
});

test("topicNeighbours returns nulls for an unknown slug", () => {
  assert.deepEqual(topicNeighbours(SYLLABUS, "missing"), {
    previous: null,
    next: null,
  });
});

// ─── selectResources ───────────────────────────────────────

test("selectResources prefers topic resources", () => {
  const result = selectResources(["lesson-a"], ["subject-a", "subject-b"]);
  assert.equal(result.source, "topic");
  assert.deepEqual(result.items, ["lesson-a"]);
});

test("selectResources falls back to subject resources", () => {
  const result = selectResources([], ["subject-a"]);
  assert.equal(result.source, "subject");
  assert.deepEqual(result.items, ["subject-a"]);
});

test("selectResources reports none when both are empty", () => {
  const result = selectResources([], []);
  assert.equal(result.source, "none");
  assert.deepEqual(result.items, []);
});
