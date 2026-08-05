"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  STORAGE_VERSION,
  buildSubmission,
  clampIndex,
  countAnswered,
  emptyAnswers,
  hasExpired,
  parseStoredSession,
  progressPercent,
  secondsRemaining,
  storageKeyFor,
  withAccumulatedTime,
  withSelectedAnswer,
  withToggledFlag,
  type AnswerMap,
  type ExamQuestion,
  type SessionData,
} from "./exam-state";

// React glue around `exam-state`. All the rules that decide whether a student
// keeps their work live in that module, where they are unit-tested; this file
// only wires them to state, timers and the network.

export type { AnswerState, ExamQuestion } from "./exam-state";
export { formatExamTime } from "./exam-state";

export type GeneratedExam = {
  attemptId: string;
  title: string;
  questions: ExamQuestion[];
  /** Null for an untimed exam, e.g. the quick quiz. */
  timeLimitMinutes: number | null;
  /** Server-authoritative deadline. Preferred over the local clock when present. */
  deadlineAt?: string;
  /** True when the server handed back an unfinished attempt rather than a new one. */
  resumed?: boolean;
};

/** What we hand back to the caller to drive the UI. */
export type ExamSession = ReturnType<typeof useExamSession>;

function readStored(sessionKey: string) {
  if (typeof window === "undefined") return null;
  try {
    return parseStoredSession(
      window.localStorage.getItem(storageKeyFor(sessionKey)),
      Date.now(),
    );
  } catch {
    return null;
  }
}

function writeStored(
  sessionKey: string,
  data: SessionData,
  answers: AnswerMap,
  currentIndex: number,
) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      storageKeyFor(sessionKey),
      JSON.stringify({ ...data, v: STORAGE_VERSION, answers, currentIndex }),
    );
  } catch {
    // storage disabled / quota — the in-memory session still works
  }
}

function clearStored(sessionKey: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(storageKeyFor(sessionKey));
  } catch {
    // nothing to clean up
  }
}

export function useExamSession({
  sessionKey,
  generate,
  resultHref,
  defaultTimeLimitMinutes = 60,
}: {
  /** Stable per exam configuration. Distinct configs must not share a session. */
  sessionKey: string;
  generate: () => Promise<GeneratedExam>;
  resultHref: (attemptId: string) => string;
  defaultTimeLimitMinutes?: number;
}) {
  const router = useRouter();

  const [data, setData] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  /** Submit failures are recoverable — kept separate so we never unmount the quiz. */
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showConfirmSubmit, setShowConfirmSubmit] = useState(false);
  const [resumed, setResumed] = useState(false);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [timeRemaining, setTimeRemaining] = useState(0);

  const [focusMode, setFocusMode] = useState(false);
  const [hideTimer, setHideTimer] = useState(false);

  // The ref is the source of truth for answers: `handleSubmit` reads it
  // synchronously right after recording time on the current question, and React
  // has not flushed the matching setState by then. Only ever written from event
  // handlers and effects — never during render.
  const answersRef = useRef<AnswerMap>({});
  const questionStartRef = useRef(0);
  const startedRef = useRef(false);
  const submittedRef = useRef(false);

  const questions = useMemo(() => data?.questions ?? [], [data]);
  const attemptId = data?.attemptId ?? "";
  const deadlineAt = data?.deadlineAt ?? null;

  /** O(1) index lookup — the mock exam navigator used indexOf over 180 items per render. */
  const indexById = useMemo(() => {
    const map = new Map<string, number>();
    questions.forEach((q, i) => map.set(q.id, i));
    return map;
  }, [questions]);

  const persist = useCallback(
    (index: number) => {
      if (!data) return;
      writeStored(sessionKey, data, answersRef.current, index);
    },
    [data, sessionKey],
  );

  // ── Start or resume ──────────────────────────────────────
  useEffect(() => {
    // Guard against React's double-invoked effects in development: without it
    // every mount generated (and abandoned) a second assessment row.
    if (startedRef.current) return;
    startedRef.current = true;

    let cancelled = false;

    (async () => {
      const stored = readStored(sessionKey);
      if (stored) {
        if (cancelled) return;
        answersRef.current = stored.answers;
        questionStartRef.current = Date.now();
        setData({
          attemptId: stored.attemptId,
          title: stored.title,
          questions: stored.questions,
          deadlineAt: stored.deadlineAt,
          startedAt: stored.startedAt,
        });
        setAnswers(stored.answers);
        setCurrentIndex(clampIndex(stored.currentIndex, stored.questions.length));
        setResumed(true);
        setLoading(false);
        return;
      }

      try {
        const exam = await generate();
        if (cancelled) return;
        // Prefer the server's deadline; it is what submission is judged against.
        // No server deadline and no configured time limit means an untimed
        // session such as the quick quiz — leave it without a deadline rather
        // than inventing one from `defaultTimeLimitMinutes`.
        const minutes = exam.timeLimitMinutes || defaultTimeLimitMinutes;
        let deadline: number | null;
        if (exam.deadlineAt) {
          deadline = new Date(exam.deadlineAt).getTime();
        } else if (minutes) {
          deadline = Date.now() + minutes * 60 * 1000;
        } else {
          deadline = null;
        }
        const session: SessionData = {
          attemptId: exam.attemptId,
          title: exam.title,
          questions: exam.questions,
          deadlineAt: deadline,
          startedAt: Date.now(),
        };
        answersRef.current = emptyAnswers(exam.questions);
        questionStartRef.current = Date.now();
        writeStored(sessionKey, session, answersRef.current, 0);
        setData(session);
        setAnswers(answersRef.current);
        // The server may have handed back an unfinished attempt — e.g. after
        // switching device, or when local storage was cleared.
        if (exam.resumed) setResumed(true);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        // A failed start is unrecoverable in place — surface it as a hard error.
        startedRef.current = false;
        setError(
          err instanceof Error ? err.message : "Network error. Please try again.",
        );
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sessionKey, generate, defaultTimeLimitMinutes]);

  // ── Timer ────────────────────────────────────────────────
  // Anchored to an absolute deadline. A decrementing counter drifts and, worse,
  // stalls entirely when a mobile browser throttles the backgrounded tab —
  // handing the student minutes of extra exam time.
  useEffect(() => {
    if (deadlineAt == null) return;
    const tick = () => setTimeRemaining(secondsRemaining(deadlineAt, Date.now()));
    tick();
    const interval = setInterval(tick, 500);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [deadlineAt]);

  // ── Mutations ────────────────────────────────────────────
  const recordTimeOnQuestion = useCallback(() => {
    const q = questions[currentIndex];
    if (!q) return;
    const elapsed = (Date.now() - questionStartRef.current) / 1000;
    questionStartRef.current = Date.now();
    const next = withAccumulatedTime(answersRef.current, q.id, elapsed);
    if (next === answersRef.current) return;
    answersRef.current = next;
    setAnswers(next);
  }, [questions, currentIndex]);

  const selectAnswer = useCallback(
    (questionId: string, choice: string) => {
      answersRef.current = withSelectedAnswer(answersRef.current, questionId, choice);
      setAnswers(answersRef.current);
      persist(currentIndex);
    },
    [persist, currentIndex],
  );

  const toggleFlag = useCallback(
    (questionId: string) => {
      answersRef.current = withToggledFlag(answersRef.current, questionId);
      setAnswers(answersRef.current);
      persist(currentIndex);
    },
    [persist, currentIndex],
  );

  const goToQuestion = useCallback(
    (index: number) => {
      if (!questions[index]) return;
      recordTimeOnQuestion();
      setCurrentIndex(index);
      persist(index);
    },
    [questions, recordTimeOnQuestion, persist],
  );

  // ── Submit ───────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    if (submittedRef.current || !attemptId) return;
    submittedRef.current = true;
    setSubmitting(true);
    setSubmitError("");
    recordTimeOnQuestion();

    try {
      const res = await fetch("/api/assessments/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attemptId,
          answers: buildSubmission(questions, answersRef.current),
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        // Keep the session mounted and the answers intact so the student can
        // retry. Losing two hours of work to one failed request is not an option.
        submittedRef.current = false;
        setSubmitError(
          body.error || "Couldn't submit. Check your connection and try again.",
        );
        setSubmitting(false);
        return;
      }

      clearStored(sessionKey);
      setShowConfirmSubmit(false);
      router.push(resultHref(attemptId));
    } catch {
      submittedRef.current = false;
      setSubmitError(
        "Couldn't reach the server. Your answers are saved — try again.",
      );
      setSubmitting(false);
    }
  }, [attemptId, questions, recordTimeOnQuestion, resultHref, router, sessionKey]);

  // Kept in a ref so the timer can reach the newest closure without restarting.
  const submitRef = useRef(handleSubmit);
  useEffect(() => {
    submitRef.current = handleSubmit;
  }, [handleSubmit]);

  // Auto-submit lives in its own effect rather than inside a setState updater.
  // Updaters must be pure — React invokes them twice under StrictMode, which
  // fired two submissions and read a stale `submitting` guard. `hasExpired`
  // reads the clock rather than `timeRemaining`, which is still 0 from its
  // initial state on the commit where the session first loads.
  useEffect(() => {
    if (submittedRef.current) return;
    if (!hasExpired(deadlineAt, Date.now())) return;
    submitRef.current();
  }, [timeRemaining, deadlineAt]);

  // Warn before an accidental refresh or tab close. Answers are persisted, so
  // this is a courtesy rather than the safety net.
  useEffect(() => {
    if (!attemptId) return;
    function onBeforeUnload(event: BeforeUnloadEvent) {
      if (submittedRef.current) return;
      event.preventDefault();
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [attemptId]);

  // ── Derived ──────────────────────────────────────────────
  const { answeredCount, flaggedCount } = useMemo(
    () => countAnswered(questions, answers),
    [questions, answers],
  );

  const isAnswered = useCallback(
    (questionId: string) => Boolean(answers[questionId]?.selectedAnswer),
    [answers],
  );

  return {
    // state
    loading,
    error,
    submitError,
    submitting,
    resumed,
    attemptId,
    title: data?.title ?? "",
    questions,
    currentIndex,
    currentQuestion: questions[currentIndex],
    answers,
    timeRemaining,
    deadlineAt,
    showConfirmSubmit,
    focusMode,
    hideTimer,
    // derived
    indexById,
    answeredCount,
    flaggedCount,
    unanswered: Math.max(0, questions.length - answeredCount),
    progressPercent: progressPercent(questions, answers),
    lowTime: timeRemaining > 0 && timeRemaining < 300,
    // actions
    setShowConfirmSubmit,
    setFocusMode,
    setHideTimer,
    selectAnswer,
    toggleFlag,
    goToQuestion,
    handleSubmit,
    isAnswered,
  };
}
