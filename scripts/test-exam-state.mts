import { test } from "node:test";
import assert from "node:assert/strict";
import {
  STORAGE_VERSION,
  buildSubmission,
  clampIndex,
  countAnswered,
  emptyAnswers,
  formatExamTime,
  hasExpired,
  parseStoredSession,
  progressPercent,
  secondsRemaining,
  withAccumulatedTime,
  withSelectedAnswer,
  withToggledFlag,
  type AnswerMap,
  type ExamQuestion,
  type StoredSession,
} from "../src/components/assessment/exam-state";

const NOW = 1_770_000_000_000;

function question(id: string, overrides: Partial<ExamQuestion> = {}): ExamQuestion {
  return {
    id,
    questionNumber: 1,
    questionText: `Question ${id}`,
    questionImageUrl: null,
    questionType: "OBJECTIVE",
    options: { A: "a", B: "b", C: "c", D: "d" },
    difficulty: "INTERMEDIATE",
    marks: 1,
    examType: "JAMB",
    examYear: 2024,
    ...overrides,
  };
}

function storedSession(
  overrides: Partial<Omit<StoredSession, "deadlineAt">> & {
    deadlineAt?: number | null;
  } = {},
): StoredSession {
  const questions = [question("q1"), question("q2")];
  return {
    v: STORAGE_VERSION,
    attemptId: "attempt_1",
    title: "Physics Quiz",
    questions,
    deadlineAt: NOW + 600_000,
    answers: emptyAnswers(questions),
    currentIndex: 0,
    ...overrides,
  };
}

// ─── parseStoredSession ────────────────────────────────────

test("parseStoredSession restores a live session", () => {
  const session = storedSession();
  const parsed = parseStoredSession(JSON.stringify(session), NOW);
  assert.ok(parsed);
  assert.equal(parsed.attemptId, "attempt_1");
  assert.equal(parsed.questions.length, 2);
});

test("parseStoredSession rejects an expired session", () => {
  // The time is gone either way; resuming would show 0:00 and submit instantly.
  const session = storedSession({ deadlineAt: NOW - 1 });
  assert.equal(parseStoredSession(JSON.stringify(session), NOW), null);
});

test("parseStoredSession rejects a session expiring exactly now", () => {
  const session = storedSession({ deadlineAt: NOW });
  assert.equal(parseStoredSession(JSON.stringify(session), NOW), null);
});

test("parseStoredSession rejects a stale schema version", () => {
  const session = storedSession({ v: STORAGE_VERSION - 1 });
  assert.equal(parseStoredSession(JSON.stringify(session), NOW), null);
});

test("parseStoredSession rejects corrupt JSON rather than throwing", () => {
  assert.equal(parseStoredSession("{not json", NOW), null);
});

test("parseStoredSession rejects null and empty input", () => {
  assert.equal(parseStoredSession(null, NOW), null);
  assert.equal(parseStoredSession("", NOW), null);
  assert.equal(parseStoredSession("null", NOW), null);
});

test("parseStoredSession rejects a session with no questions", () => {
  // Guards the clampIndex(-1) that an empty list would otherwise produce.
  const session = storedSession({ questions: [] });
  assert.equal(parseStoredSession(JSON.stringify(session), NOW), null);
});

test("parseStoredSession rejects a missing attemptId", () => {
  const session = storedSession({ attemptId: "" });
  assert.equal(parseStoredSession(JSON.stringify(session), NOW), null);
});

test("parseStoredSession rejects a non-numeric deadline", () => {
  const session = storedSession();
  const broken = { ...session, deadlineAt: "soon" };
  assert.equal(parseStoredSession(JSON.stringify(broken), NOW), null);
});

test("parseStoredSession restores an untimed session", () => {
  // A quick quiz has no deadline; it must still be resumable.
  const session = storedSession({ deadlineAt: null });
  const parsed = parseStoredSession(JSON.stringify(session), NOW);
  assert.ok(parsed);
  assert.equal(parsed.deadlineAt, null);
});

test("an untimed session never expires", () => {
  assert.equal(hasExpired(null, NOW), false);
  assert.equal(hasExpired(null, NOW + 10_000_000), false);
});

test("parseStoredSession still rejects a malformed deadline", () => {
  // null means untimed; a string is corruption and must not resume.
  const broken = { ...storedSession(), deadlineAt: "soon" };
  assert.equal(parseStoredSession(JSON.stringify(broken), NOW), null);
});

// ─── expiry and clock ──────────────────────────────────────

test("hasExpired is false before the deadline and true after", () => {
  assert.equal(hasExpired(NOW + 1, NOW), false);
  assert.equal(hasExpired(NOW, NOW), true);
  assert.equal(hasExpired(NOW - 1, NOW), true);
});

test("hasExpired is false when no session is loaded", () => {
  // The auto-submit effect must not fire before a deadline exists.
  assert.equal(hasExpired(null, NOW), false);
});

test("secondsRemaining never goes negative", () => {
  assert.equal(secondsRemaining(NOW - 60_000, NOW), 0);
  assert.equal(secondsRemaining(NOW + 90_000, NOW), 90);
});

test("clampIndex keeps a restored cursor in range", () => {
  assert.equal(clampIndex(5, 2), 1);
  assert.equal(clampIndex(-3, 2), 0);
  assert.equal(clampIndex(1, 2), 1);
  assert.equal(clampIndex(0, 0), 0);
  assert.equal(clampIndex(NaN, 5), 0);
});

// ─── answer mutations ──────────────────────────────────────

test("withSelectedAnswer records a choice", () => {
  const answers = emptyAnswers([question("q1")]);
  const next = withSelectedAnswer(answers, "q1", "B");
  assert.equal(next.q1.selectedAnswer, "B");
});

test("withSelectedAnswer re-picking the same option clears it", () => {
  const answers = withSelectedAnswer(emptyAnswers([question("q1")]), "q1", "B");
  assert.equal(withSelectedAnswer(answers, "q1", "B").q1.selectedAnswer, null);
});

test("withSelectedAnswer switching options replaces the choice", () => {
  const answers = withSelectedAnswer(emptyAnswers([question("q1")]), "q1", "B");
  assert.equal(withSelectedAnswer(answers, "q1", "C").q1.selectedAnswer, "C");
});

test("withSelectedAnswer preserves time and flag", () => {
  let answers = emptyAnswers([question("q1")]);
  answers = withAccumulatedTime(answers, "q1", 42);
  answers = withToggledFlag(answers, "q1");
  const next = withSelectedAnswer(answers, "q1", "A");
  assert.equal(next.q1.timeSpentSeconds, 42);
  assert.equal(next.q1.flaggedForReview, true);
});

test("withSelectedAnswer does not mutate the input", () => {
  const answers = emptyAnswers([question("q1")]);
  withSelectedAnswer(answers, "q1", "A");
  assert.equal(answers.q1.selectedAnswer, null);
});

test("withSelectedAnswer handles a question absent from the map", () => {
  const next = withSelectedAnswer({}, "surprise", "D");
  assert.equal(next.surprise.selectedAnswer, "D");
  assert.equal(next.surprise.timeSpentSeconds, 0);
});

test("withToggledFlag flips both ways", () => {
  let answers = emptyAnswers([question("q1")]);
  answers = withToggledFlag(answers, "q1");
  assert.equal(answers.q1.flaggedForReview, true);
  answers = withToggledFlag(answers, "q1");
  assert.equal(answers.q1.flaggedForReview, false);
});

test("withAccumulatedTime adds across visits", () => {
  let answers = emptyAnswers([question("q1")]);
  answers = withAccumulatedTime(answers, "q1", 10);
  answers = withAccumulatedTime(answers, "q1", 5);
  assert.equal(answers.q1.timeSpentSeconds, 15);
});

test("withAccumulatedTime ignores zero, negative and non-finite deltas", () => {
  const answers = emptyAnswers([question("q1")]);
  assert.equal(withAccumulatedTime(answers, "q1", 0).q1.timeSpentSeconds, 0);
  assert.equal(withAccumulatedTime(answers, "q1", -9).q1.timeSpentSeconds, 0);
  assert.equal(withAccumulatedTime(answers, "q1", NaN).q1.timeSpentSeconds, 0);
});

// ─── derived counts ────────────────────────────────────────

test("countAnswered treats a missing entry as unanswered", () => {
  // Regression: `undefined !== null` is true, which counted every untouched
  // question as answered.
  const questions = [question("q1"), question("q2")];
  assert.deepEqual(countAnswered(questions, {}), {
    answeredCount: 0,
    flaggedCount: 0,
  });
});

test("countAnswered ignores a cleared answer", () => {
  const questions = [question("q1")];
  let answers = withSelectedAnswer(emptyAnswers(questions), "q1", "A");
  answers = withSelectedAnswer(answers, "q1", "A");
  assert.equal(countAnswered(questions, answers).answeredCount, 0);
});

test("countAnswered only counts questions in this exam", () => {
  const questions = [question("q1")];
  const answers: AnswerMap = {
    q1: { selectedAnswer: "A", timeSpentSeconds: 0, flaggedForReview: false },
    strayFromAnotherExam: {
      selectedAnswer: "B",
      timeSpentSeconds: 0,
      flaggedForReview: true,
    },
  };
  assert.deepEqual(countAnswered(questions, answers), {
    answeredCount: 1,
    flaggedCount: 0,
  });
});

test("progressPercent is 0 for an empty exam rather than NaN", () => {
  assert.equal(progressPercent([], {}), 0);
});

test("progressPercent reports the answered fraction", () => {
  const questions = [question("q1"), question("q2"), question("q3"), question("q4")];
  const answers = withSelectedAnswer(emptyAnswers(questions), "q1", "A");
  assert.equal(progressPercent(questions, answers), 25);
});

// ─── submission ────────────────────────────────────────────

test("buildSubmission emits one entry per question in exam order", () => {
  const questions = [question("q1"), question("q2"), question("q3")];
  const answers = withSelectedAnswer(emptyAnswers(questions), "q2", "C");
  const payload = buildSubmission(questions, answers);
  assert.deepEqual(
    payload.map((p) => p.questionId),
    ["q1", "q2", "q3"],
  );
  assert.equal(payload[1].selectedAnswer, "C");
});

test("buildSubmission includes untouched questions as blanks", () => {
  // The server grades every question; omitting blanks would change totalMarks.
  const questions = [question("q1"), question("q2")];
  const payload = buildSubmission(questions, {});
  assert.equal(payload.length, 2);
  assert.deepEqual(payload[0], {
    questionId: "q1",
    selectedAnswer: null,
    timeSpentSeconds: 0,
    flaggedForReview: false,
  });
});

test("buildSubmission never emits duplicate questionIds", () => {
  const questions = [question("q1"), question("q2"), question("q3")];
  const payload = buildSubmission(questions, {});
  assert.equal(new Set(payload.map((p) => p.questionId)).size, payload.length);
});

test("buildSubmission carries accumulated time and flags", () => {
  const questions = [question("q1")];
  let answers = withAccumulatedTime(emptyAnswers(questions), "q1", 73);
  answers = withToggledFlag(answers, "q1");
  const [entry] = buildSubmission(questions, answers);
  assert.equal(entry.timeSpentSeconds, 73);
  assert.equal(entry.flaggedForReview, true);
});

// ─── formatting ────────────────────────────────────────────

test("formatExamTime renders mm:ss under an hour", () => {
  assert.equal(formatExamTime(0), "0:00");
  assert.equal(formatExamTime(9), "0:09");
  assert.equal(formatExamTime(605), "10:05");
});

test("formatExamTime renders h:mm:ss at and above an hour", () => {
  assert.equal(formatExamTime(3600), "1:00:00");
  assert.equal(formatExamTime(7325), "2:02:05");
});

test("formatExamTime clamps negatives to zero", () => {
  assert.equal(formatExamTime(-30), "0:00");
});

// ─── round trip ────────────────────────────────────────────

test("a session survives persist and restore with answers intact", () => {
  const questions = [question("q1"), question("q2")];
  let answers = emptyAnswers(questions);
  answers = withSelectedAnswer(answers, "q1", "C");
  answers = withAccumulatedTime(answers, "q1", 30);
  answers = withToggledFlag(answers, "q2");

  const raw = JSON.stringify(storedSession({ answers, currentIndex: 1 }));
  const restored = parseStoredSession(raw, NOW);

  assert.ok(restored);
  assert.equal(restored.answers.q1.selectedAnswer, "C");
  assert.equal(restored.answers.q1.timeSpentSeconds, 30);
  assert.equal(restored.answers.q2.flaggedForReview, true);
  assert.equal(clampIndex(restored.currentIndex, restored.questions.length), 1);
  assert.deepEqual(
    buildSubmission(restored.questions, restored.answers).map(
      (p) => p.selectedAnswer,
    ),
    ["C", null],
  );
});
