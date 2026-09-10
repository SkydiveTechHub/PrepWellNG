import { test } from "node:test";
import assert from "node:assert/strict";
import {
  paperPageDescription,
  paperPageIntro,
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

test("truncation never splits a surrogate pair (emoji-dense input)", () => {
  // Slicing by UTF-16 code unit can land the cut point inside a surrogate
  // pair, leaving a lone high surrogate right before the ellipsis — an
  // invalid character inside <meta name="description">.
  // No spaces before the cut point, so clamp() falls back to its raw index
  // cut (lastIndexOf(" ") === -1) instead of backing up to a word boundary —
  // exactly the path that can land mid-surrogate-pair. 81 emoji is 162
  // UTF-16 code units, just past MAX_DESCRIPTION (160), with the cut at
  // index 159 landing on the high surrogate of the 80th emoji.
  const emojiDense = "😀".repeat(81);
  const built = topicPageDescription({
    topicTitle: "T",
    subjectName: "S",
    description: emojiDense,
    subtopicTitles: [],
  });
  assert.ok(built.isWellFormed(), `truncated string is not well-formed UTF-16: ${JSON.stringify(built)}`);
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

test("the visible paper intro does not claim every question is shown", () => {
  // paperPageDescription is fine as a <meta> snippet, but as the page's own
  // opening sentence "each with the correct answer and a worked explanation"
  // is false when only 5 of 42 are rendered. paperPageIntro must state the
  // real paper size without claiming every question got a worked answer.
  const built = paperPageIntro({
    exam: "WAEC",
    year: 2019,
    subjectName: "Biology",
    questionCount: 42,
    topicCount: 7,
    sampleCount: 5,
  });
  assert.match(built, /42/);
  assert.match(built, /5/);
  // The clause promising a worked answer for "each" question must be scoped
  // to the 5 samples, not to the paper's real size of 42.
  const workedClause = built.split(/(?<=[.?!])\s+/).find((s) => /each with/.test(s));
  assert.ok(workedClause, `expected a sentence containing "each with": ${built}`);
  assert.match(workedClause!, /\b5\b/);
  assert.ok(!/\b42\b/.test(workedClause!), `worked-answer clause must not claim all 42: ${built}`);
});

test("the paper intro states real counts and stays inside the render budget", () => {
  const built = paperPageIntro({
    exam: "JAMB",
    year: 2021,
    subjectName: "Physics",
    questionCount: 10,
    topicCount: 3,
    sampleCount: 5,
  });
  assert.ok(built.length <= 160, `got ${built.length} characters`);
});
