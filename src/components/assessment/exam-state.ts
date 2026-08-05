// Pure exam-session logic: storage parsing, expiry, answer mutations and
// submission shaping. Kept free of React and of `window` so the rules that
// guard a student's two hours of work can be tested directly.

export type ExamQuestion = {
  id: string;
  questionNumber: number;
  questionText: string;
  questionImageUrl: string | null;
  questionType: string;
  options: Record<string, string> | null;
  difficulty: string;
  marks: number;
  examType: string;
  examYear: number | null;
  /** Present on mock exams, which span several subjects. */
  subjectName?: string;
  subjectCode?: string;
};

export type AnswerState = {
  selectedAnswer: string | null;
  timeSpentSeconds: number;
  flaggedForReview: boolean;
};

export type AnswerMap = Record<string, AnswerState>;

/** The immutable half of a session: settled once, at start or resume. */
export type SessionData = {
  attemptId: string;
  title: string;
  questions: ExamQuestion[];
  /**
   * Absolute epoch ms, or null for an untimed session such as the quick quiz.
   * Survives refreshes and tab-throttling; a countdown does not.
   */
  deadlineAt: number | null;
};

export type StoredSession = SessionData & {
  v: number;
  answers: AnswerMap;
  currentIndex: number;
};

export const STORAGE_PREFIX = "prepwell:exam:";
export const STORAGE_VERSION = 2;

export function storageKeyFor(sessionKey: string): string {
  return STORAGE_PREFIX + sessionKey;
}

const BLANK: AnswerState = {
  selectedAnswer: null,
  timeSpentSeconds: 0,
  flaggedForReview: false,
};

export function emptyAnswers(questions: readonly ExamQuestion[]): AnswerMap {
  const initial: AnswerMap = {};
  for (const q of questions) initial[q.id] = { ...BLANK };
  return initial;
}

/**
 * Parses a persisted session, returning `null` for anything unusable: wrong
 * schema version, corrupt JSON, no questions, or an already-expired deadline.
 *
 * An expired session is deliberately *not* resumable — the time is gone either
 * way, and restoring it would show a 0:00 clock that submits on the next tick.
 */
export function parseStoredSession(
  raw: string | null,
  now: number,
): StoredSession | null {
  if (!raw) return null;
  let parsed: StoredSession;
  try {
    parsed = JSON.parse(raw) as StoredSession;
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  if (parsed.v !== STORAGE_VERSION) return null;
  if (typeof parsed.attemptId !== "string" || parsed.attemptId === "") {
    return null;
  }
  if (!Array.isArray(parsed.questions) || parsed.questions.length === 0) {
    return null;
  }
  // null is a legitimate value meaning "untimed"; anything non-numeric that
  // is not null is corruption.
  if (parsed.deadlineAt !== null) {
    if (
      typeof parsed.deadlineAt !== "number" ||
      !Number.isFinite(parsed.deadlineAt)
    ) {
      return null;
    }
    if (parsed.deadlineAt <= now) return null;
  }
  if (!parsed.answers || typeof parsed.answers !== "object") return null;
  return parsed;
}

/** Clamps a restored cursor into range for the restored question list. */
export function clampIndex(index: number, length: number): number {
  if (!Number.isFinite(index) || length <= 0) return 0;
  return Math.min(Math.max(0, Math.floor(index)), length - 1);
}

export function secondsRemaining(deadlineAt: number, now: number): number {
  return Math.max(0, Math.round((deadlineAt - now) / 1000));
}

/**
 * Whether the deadline has passed. Compared against the clock rather than a
 * cached countdown: on the render where a session first loads, `deadlineAt` is
 * already set while the countdown state is still at its initial 0, and trusting
 * that value auto-submits the exam the moment it opens.
 */
export function hasExpired(deadlineAt: number | null, now: number): boolean {
  return deadlineAt != null && now >= deadlineAt;
}

// ── Answer mutations (all pure; return a new map) ──────────

export function withSelectedAnswer(
  answers: AnswerMap,
  questionId: string,
  choice: string,
): AnswerMap {
  const prev = answers[questionId] ?? BLANK;
  return {
    ...answers,
    [questionId]: {
      ...prev,
      // Re-picking the same option clears it, so a misclick is recoverable.
      selectedAnswer: prev.selectedAnswer === choice ? null : choice,
    },
  };
}

export function withToggledFlag(
  answers: AnswerMap,
  questionId: string,
): AnswerMap {
  const prev = answers[questionId] ?? BLANK;
  return {
    ...answers,
    [questionId]: { ...prev, flaggedForReview: !prev.flaggedForReview },
  };
}

export function withAccumulatedTime(
  answers: AnswerMap,
  questionId: string,
  elapsedSeconds: number,
): AnswerMap {
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0) return answers;
  const prev = answers[questionId] ?? BLANK;
  return {
    ...answers,
    [questionId]: {
      ...prev,
      timeSpentSeconds: prev.timeSpentSeconds + Math.floor(elapsedSeconds),
    },
  };
}

// ── Derived ────────────────────────────────────────────────

export function countAnswered(
  questions: readonly ExamQuestion[],
  answers: AnswerMap,
): { answeredCount: number; flaggedCount: number } {
  let answeredCount = 0;
  let flaggedCount = 0;
  for (const q of questions) {
    const a = answers[q.id];
    // Truthiness, not `!== null`: a missing entry is undefined, and `undefined
    // !== null` counted unanswered questions as answered.
    if (a?.selectedAnswer) answeredCount += 1;
    if (a?.flaggedForReview) flaggedCount += 1;
  }
  return { answeredCount, flaggedCount };
}

export function progressPercent(
  questions: readonly ExamQuestion[],
  answers: AnswerMap,
): number {
  if (questions.length === 0) return 0; // guards NaN on an empty question list
  return (countAnswered(questions, answers).answeredCount / questions.length) * 100;
}

export type SubmissionAnswer = {
  questionId: string;
  selectedAnswer: string | null;
  timeSpentSeconds: number;
  flaggedForReview: boolean;
};

/** One entry per question, in exam order, including untouched ones. */
export function buildSubmission(
  questions: readonly ExamQuestion[],
  answers: AnswerMap,
): SubmissionAnswer[] {
  return questions.map((q) => {
    const a = answers[q.id];
    return {
      questionId: q.id,
      selectedAnswer: a?.selectedAnswer ?? null,
      timeSpentSeconds: a?.timeSpentSeconds ?? 0,
      flaggedForReview: a?.flaggedForReview ?? false,
    };
  });
}

export function formatExamTime(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}`;
  }
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}
