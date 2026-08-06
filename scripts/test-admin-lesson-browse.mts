import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normaliseFilter,
  tracksWithSubjects,
  subjectsForTrack,
  levelsPresent,
  groupByClass,
} from "../src/lib/admin-lesson-browse";

const SUBJECTS = [
  { id: "eng", name: "English Language", trackCategory: "CORE" },
  { id: "mth", name: "Mathematics", trackCategory: "CORE" },
  { id: "phy", name: "Physics", trackCategory: "SCIENCE" },
  { id: "lit", name: "Literature", trackCategory: "ARTS" },
];

const TOPICS = [
  { classLevel: "SS2", term: "FIRST" },
  { classLevel: "SS1", term: "THIRD" },
  { classLevel: "SS1", term: "FIRST" },
  { classLevel: "SS2", term: "FIRST" },
];

// ─── normaliseFilter ──────────────────────────────────────

test("a valid filter survives normalisation intact", () => {
  const filter = normaliseFilter({
    track: "SCIENCE",
    subject: "phy",
    class: "SS2",
    term: "FIRST",
  });
  assert.deepEqual(filter, {
    track: "SCIENCE",
    subjectId: "phy",
    classLevel: "SS2",
    term: "FIRST",
  });
});

test("an unrecognised track, class or term is dropped rather than passed to Prisma", () => {
  const filter = normaliseFilter({
    track: "PHYSICS",
    subject: "phy",
    class: "JSS1",
    term: "FOURTH",
  });
  assert.equal(filter.track, null);
  assert.equal(filter.classLevel, null);
  assert.equal(filter.term, null);
  assert.equal(filter.subjectId, "phy");
});

test("class and term are dropped when no subject is selected, since they cannot apply", () => {
  const filter = normaliseFilter({ class: "SS2", term: "FIRST" });
  assert.equal(filter.subjectId, null);
  assert.equal(filter.classLevel, null);
  assert.equal(filter.term, null);
});

test("an empty query string yields an empty filter", () => {
  assert.deepEqual(normaliseFilter({}), {
    track: null,
    subjectId: null,
    classLevel: null,
    term: null,
  });
});

// ─── tracksWithSubjects ───────────────────────────────────

test("a track with no subjects is left out of the dropdown", () => {
  const tracks = tracksWithSubjects(SUBJECTS);
  assert.deepEqual(
    tracks.map((t) => t.value),
    ["CORE", "SCIENCE", "ARTS"],
  );
  assert.equal(
    tracks.some((t) => t.value === "VOCATIONAL"),
    false,
  );
});

test("tracks are labelled and ordered by category, not by subject name", () => {
  const tracks = tracksWithSubjects([...SUBJECTS].reverse());
  assert.deepEqual(
    tracks.map((t) => t.value),
    ["CORE", "SCIENCE", "ARTS"],
  );
  assert.equal(tracks[0].label, "Core");
});

// ─── subjectsForTrack ─────────────────────────────────────

test("every subject is offered when no track is selected", () => {
  assert.equal(subjectsForTrack(SUBJECTS, null).length, 4);
});

test("a core subject does not appear under the science track", () => {
  const science = subjectsForTrack(SUBJECTS, "SCIENCE");
  assert.deepEqual(
    science.map((s) => s.id),
    ["phy"],
  );
});

// ─── levelsPresent ────────────────────────────────────────

test("only the class levels the topics actually use are offered, in enum order", () => {
  const { classLevels } = levelsPresent(TOPICS, null);
  assert.deepEqual(classLevels, ["SS1", "SS2"]);
});

test("terms are scoped to the selected class", () => {
  assert.deepEqual(levelsPresent(TOPICS, "SS2").terms, ["FIRST"]);
  assert.deepEqual(levelsPresent(TOPICS, "SS1").terms, ["FIRST", "THIRD"]);
});

test("with no class selected the terms span every class", () => {
  assert.deepEqual(levelsPresent(TOPICS, null).terms, ["FIRST", "THIRD"]);
});

// ─── groupByClass ─────────────────────────────────────────

test("rows are grouped into class sections ordered SS1 to SS3, each counted", () => {
  const sections = groupByClass([
    { topicId: "c", classLevel: "SS3", term: "FIRST" },
    { topicId: "a", classLevel: "SS1", term: "FIRST" },
    { topicId: "b", classLevel: "SS3", term: "SECOND" },
  ]);
  assert.deepEqual(
    sections.map((s) => s.classLevel),
    ["SS1", "SS3"],
  );
  assert.deepEqual(
    sections.map((s) => s.rows.length),
    [1, 2],
  );
});

test("grouping preserves the order rows arrived in within a section", () => {
  const sections = groupByClass([
    { topicId: "b", classLevel: "SS1", term: "SECOND" },
    { topicId: "a", classLevel: "SS1", term: "FIRST" },
  ]);
  assert.deepEqual(
    sections[0].rows.map((r) => r.topicId),
    ["b", "a"],
  );
});
