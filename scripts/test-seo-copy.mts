import { test } from "node:test";
import assert from "node:assert/strict";
import {
  paperPageDescription,
  paperPageTitle,
  topicPageDescription,
  topicPageTitle,
} from "../src/lib/seo/copy";

test("the topic title names the topic before the subject", () => {
  assert.equal(
    topicPageTitle({ topicTitle: "Cell Structure", subjectName: "Biology" }),
    "Cell Structure — Biology",
  );
});

test("a real topic description is used as written", () => {
  const description = "Cells are the basic structural unit of every organism.";
  assert.equal(
    topicPageDescription({
      topicTitle: "Cell Structure",
      subjectName: "Biology",
      description,
      subtopicTitles: ["Organelles"],
    }),
    description,
  );
});

test("a missing description falls back to the subtopics, not to boilerplate", () => {
  const built = topicPageDescription({
    topicTitle: "Cell Structure",
    subjectName: "Biology",
    description: null,
    subtopicTitles: ["Organelles", "The cell membrane", "Cell division"],
  });
  assert.match(built, /Cell Structure/);
  assert.match(built, /Biology/);
  assert.match(built, /Organelles/);
});

test("descriptions stay inside the length search engines will render", () => {
  const long = "x".repeat(400);
  const built = topicPageDescription({
    topicTitle: "T",
    subjectName: "S",
    description: long,
    subtopicTitles: [],
  });
  assert.ok(built.length <= 160, `got ${built.length} characters`);
  assert.ok(built.endsWith("…"), "a truncated description should be marked as such");
});

test("truncation happens at a word boundary", () => {
  const built = topicPageDescription({
    topicTitle: "T",
    subjectName: "S",
    description: `${"word ".repeat(60)}end`,
    subtopicTitles: [],
  });
  assert.ok(!built.includes("wor…"), "should not cut mid-word");
});

test("the paper title matches how students actually search", () => {
  assert.equal(
    paperPageTitle({ exam: "WAEC", year: 2019, subjectName: "Biology" }),
    "WAEC 2019 Biology Past Questions and Answers",
  );
});

test("the paper description states real counts", () => {
  const built = paperPageDescription({
    exam: "WAEC",
    year: 2019,
    subjectName: "Biology",
    questionCount: 42,
    topicCount: 7,
  });
  assert.match(built, /42/);
  assert.match(built, /7/);
  assert.match(built, /WAEC 2019 Biology/);
});

test("a single topic is not described in the plural", () => {
  const built = paperPageDescription({
    exam: "JAMB",
    year: 2021,
    subjectName: "Physics",
    questionCount: 1,
    topicCount: 1,
  });
  assert.ok(!/1 topics/.test(built), built);
  assert.ok(!/1 questions/.test(built), built);
});
