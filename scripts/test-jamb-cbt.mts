import { test } from "node:test";
import assert from "node:assert/strict";
import {
  JAMB_SPEC,
  assessCoverage,
  coverageMessage,
  jambBand,
  questionsForSubject,
  scoreJambPaper,
  validateSubjectChoice,
  type SubjectRequirement,
} from "../src/lib/jamb-cbt";

// ─── Paper shape ───────────────────────────────────────────

test("the official paper is 180 questions over 2 hours, marked out of 400", () => {
  assert.equal(JAMB_SPEC.totalQuestions, 180);
  assert.equal(JAMB_SPEC.durationMinutes, 120);
  assert.equal(JAMB_SPEC.totalMarks, 400);
  assert.equal(JAMB_SPEC.subjectCount, 4);
});

test("English carries 60 questions and every other subject 40", () => {
  assert.equal(questionsForSubject("ENG"), 60);
  assert.equal(questionsForSubject("BIO"), 40);
  assert.equal(questionsForSubject("MTH"), 40);
});

test("the four subjects add up to exactly 180", () => {
  const total =
    questionsForSubject("ENG") +
    questionsForSubject("BIO") +
    questionsForSubject("CHM") +
    questionsForSubject("PHY");
  assert.equal(total, JAMB_SPEC.totalQuestions);
});

// ─── Subject selection ─────────────────────────────────────

test("exactly three subjects alongside English is valid", () => {
  assert.equal(validateSubjectChoice(["b", "c", "p"], "eng"), null);
});

test("too few or too many subjects is rejected", () => {
  assert.equal(validateSubjectChoice(["b", "c"], "eng"), "WRONG_COUNT");
  assert.equal(validateSubjectChoice(["b", "c", "p", "m"], "eng"), "WRONG_COUNT");
  assert.equal(validateSubjectChoice([], "eng"), "WRONG_COUNT");
});

test("the same subject twice is rejected", () => {
  assert.equal(validateSubjectChoice(["b", "b", "c"], "eng"), "DUPLICATE");
});

test("English cannot be chosen as one of the three", () => {
  // Otherwise the candidate sits a paper with only three distinct subjects.
  assert.equal(
    validateSubjectChoice(["eng", "b", "c"], "eng"),
    "ENGLISH_NOT_CHOOSABLE",
  );
});

// ─── Coverage ──────────────────────────────────────────────

function req(
  code: string,
  available: number,
  required = questionsForSubject(code),
): SubjectRequirement {
  return {
    subjectId: `id-${code}`,
    subjectCode: code,
    subjectName: code,
    required,
    available,
  };
}

test("full coverage passes", () => {
  const report = assessCoverage([
    req("ENG", 60),
    req("BIO", 40),
    req("CHM", 45),
    req("PHY", 40),
  ]);
  assert.equal(report.ok, true);
  assert.deepEqual(report.shortfalls, []);
});

test("a single short subject fails the whole paper", () => {
  // All-or-nothing on purpose: a short paper scored over 400 is not a JAMB sim.
  const report = assessCoverage([
    req("ENG", 60),
    req("BIO", 39),
    req("CHM", 40),
    req("PHY", 40),
  ]);
  assert.equal(report.ok, false);
  assert.equal(report.shortfalls.length, 1);
  assert.equal(report.shortfalls[0].subjectCode, "BIO");
});

test("an empty subject is reported as a shortfall, not skipped", () => {
  // This is today's real situation: the English bank holds zero questions.
  const report = assessCoverage([req("ENG", 0), req("BIO", 40)]);
  assert.equal(report.ok, false);
  assert.equal(report.shortfalls[0].available, 0);
});

test("the coverage message names each short subject and its counts", () => {
  const report = assessCoverage([req("ENG", 0), req("BIO", 12)]);
  const message = coverageMessage(report, 2004);
  assert.match(message, /2004/);
  assert.match(message, /ENG \(0 of 60\)/);
  assert.match(message, /BIO \(12 of 40\)/);
});

test("a passing report produces no message", () => {
  assert.equal(coverageMessage(assessCoverage([req("ENG", 60)]), 2004), "");
});

// ─── Scoring ───────────────────────────────────────────────

function paper({
  english,
  bio,
  chm,
  phy,
}: {
  english: number;
  bio: number;
  chm: number;
  phy: number;
}) {
  const responses = [];
  const spec: [string, number, number][] = [
    ["ENG", 60, english],
    ["BIO", 40, bio],
    ["CHM", 40, chm],
    ["PHY", 40, phy],
  ];
  for (const [code, total, correct] of spec) {
    for (let i = 0; i < total; i++) {
      responses.push({
        subjectId: `id-${code}`,
        subjectCode: code,
        subjectName: code,
        isCorrect: i < correct,
      });
    }
  }
  return responses;
}

test("a perfect paper scores 400", () => {
  const result = scoreJambPaper(paper({ english: 60, bio: 40, chm: 40, phy: 40 }));
  assert.equal(result.score, 400);
  assert.equal(result.totalMarks, 400);
  assert.equal(result.percentage, 100);
});

test("a blank paper scores 0", () => {
  const result = scoreJambPaper(paper({ english: 0, bio: 0, chm: 0, phy: 0 }));
  assert.equal(result.score, 0);
  assert.equal(result.percentage, 0);
});

test("each subject is worth 100 regardless of its question count", () => {
  // All of English right, everything else wrong -> exactly 100/400, even though
  // English is 60 of the 180 questions.
  const result = scoreJambPaper(paper({ english: 60, bio: 0, chm: 0, phy: 0 }));
  assert.equal(result.score, 100);

  // All of Biology right (40 questions) is likewise exactly 100.
  const bioOnly = scoreJambPaper(paper({ english: 0, bio: 40, chm: 0, phy: 0 }));
  assert.equal(bioOnly.score, 100);
});

test("an English question is worth less than a Biology one in the same paper", () => {
  const oneEnglish = scoreJambPaper([
    { subjectId: "e", subjectCode: "ENG", subjectName: "ENG", isCorrect: true },
    ...Array.from({ length: 59 }, () => ({
      subjectId: "e",
      subjectCode: "ENG",
      subjectName: "ENG",
      isCorrect: false,
    })),
  ]);
  const oneBio = scoreJambPaper([
    { subjectId: "b", subjectCode: "BIO", subjectName: "BIO", isCorrect: true },
    ...Array.from({ length: 39 }, () => ({
      subjectId: "b",
      subjectCode: "BIO",
      subjectName: "BIO",
      isCorrect: false,
    })),
  ]);
  // 100/60 vs 100/40.
  assert.ok(oneEnglish.score < oneBio.score);
  assert.equal(oneEnglish.score, 1.7);
  assert.equal(oneBio.score, 2.5);
});

test("half marks in every subject is 200", () => {
  const result = scoreJambPaper(paper({ english: 30, bio: 20, chm: 20, phy: 20 }));
  assert.equal(result.score, 200);
  assert.equal(result.percentage, 50);
});

test("per-subject breakdown reports correct, total and marks", () => {
  const result = scoreJambPaper(paper({ english: 45, bio: 30, chm: 20, phy: 10 }));
  const english = result.perSubject.find((s) => s.subjectCode === "ENG");
  assert.ok(english);
  assert.equal(english.correct, 45);
  assert.equal(english.total, 60);
  assert.equal(english.marks, 75);

  const phy = result.perSubject.find((s) => s.subjectCode === "PHY");
  assert.equal(phy?.marks, 25);
});

test("rounding happens once, so subject marks still sum to the total", () => {
  // 1/3 of each subject is a repeating decimal; naive per-subject rounding drifts.
  const result = scoreJambPaper(paper({ english: 20, bio: 13, chm: 13, phy: 13 }));
  assert.ok(Math.abs(result.score - 130.8) < 0.05);
});

test("scoring an empty response set does not divide by zero", () => {
  const result = scoreJambPaper([]);
  assert.equal(result.score, 0);
  assert.deepEqual(result.perSubject, []);
});

// ─── Bands ─────────────────────────────────────────────────

test("bands step at the usual JAMB benchmarks", () => {
  assert.equal(jambBand(320).label, "Excellent");
  assert.equal(jambBand(300).label, "Excellent");
  assert.equal(jambBand(260).label, "Strong");
  assert.equal(jambBand(210).label, "Good");
  assert.equal(jambBand(180).label, "Fair");
  assert.equal(jambBand(120).label, "Needs work");
});
