"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense } from "react";
import {
  LuClock,
  LuChevronLeft,
  LuChevronRight,
  LuFlag,
  LuCheck,
  LuTriangleAlert,
  LuBookOpen,
  LuFocus,
  LuEye,
  LuEyeOff,
} from "react-icons/lu";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

type MockQuestion = {
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
  subjectName: string;
  subjectCode: string;
};

type AnswerState = {
  selectedAnswer: string | null;
  timeSpentSeconds: number;
  flaggedForReview: boolean;
};

type SubjectGroup = {
  name: string;
  code: string;
  questions: MockQuestion[];
};

function MockExamSession() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const examType = searchParams.get("examType") || "JAMB";
  const subjectId = searchParams.get("subjectId") || undefined;

  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [showConfirmSubmit, setShowConfirmSubmit] = useState(false);

  const [attemptId, setAttemptId] = useState("");
  const [title, setTitle] = useState("");
  const [questions, setQuestions] = useState<MockQuestion[]>([]);
  const [subjectGroups, setSubjectGroups] = useState<SubjectGroup[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, AnswerState>>({});
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [quizStarted, setQuizStarted] = useState(false);
  const [activeSubject, setActiveSubject] = useState("");

  // Learner preferences
  const [focusMode, setFocusMode] = useState(false);
  const [hideTimer, setHideTimer] = useState(false);

  const questionStartTime = useRef(Date.now());
  const answerRef = useRef<Record<string, AnswerState>>({});
  answerRef.current = answers;
  const submitRef = useRef<() => void>(() => {});
  submitRef.current = handleSubmit;

  useEffect(() => {
    async function generateMock() {
      setGenerating(true);
      try {
        const body: Record<string, unknown> = { examType };
        if (subjectId) body.subjectId = subjectId;

        const res = await fetch("/api/assessments/mock-exam/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const data = await res.json();
          setError(data.error || "Failed to generate mock exam.");
          return;
        }

        const data = await res.json();
        setAttemptId(data.attemptId);
        setTitle(data.title);
        setQuestions(data.questions);
        setTimeRemaining((data.timeLimitMinutes || 90) * 60);

        const initialAnswers: Record<string, AnswerState> = {};
        for (const q of data.questions) {
          initialAnswers[q.id] = {
            selectedAnswer: null,
            timeSpentSeconds: 0,
            flaggedForReview: false,
          };
        }
        setAnswers(initialAnswers);

        const groups: SubjectGroup[] = [];
        const subjectMap = new Map<string, MockQuestion[]>();
        for (const q of data.questions) {
          const key = q.subjectCode || q.subjectName;
          if (!subjectMap.has(key)) subjectMap.set(key, []);
          subjectMap.get(key)!.push(q);
        }
        for (const [code, qs] of subjectMap) {
          groups.push({
            code,
            name: qs[0].subjectName,
            questions: qs,
          });
        }
        setSubjectGroups(groups);
        if (groups.length > 0) setActiveSubject(groups[0].code);

        setQuizStarted(true);
      } catch {
        setError("Network error. Please try again.");
      } finally {
        setGenerating(false);
        setLoading(false);
      }
    }

    generateMock();
  }, [examType, subjectId]);

  useEffect(() => {
    if (!quizStarted) return;
    const interval = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          submitRef.current();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [quizStarted]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!quizStarted || loading || error || showConfirmSubmit) return;

    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }

      const q = questions[currentIndex];
      if (!q?.options) return;

      const key = event.key.toLowerCase();
      const letterMatch = /^[a-e]$/.test(key) ? key.toUpperCase() : null;
      if (letterMatch && Object.keys(q.options).includes(letterMatch)) {
        event.preventDefault();
        selectAnswer(q.id, letterMatch);
        return;
      }

      switch (key) {
        case "arrowleft":
          event.preventDefault();
          if (currentIndex > 0) goToQuestion(currentIndex - 1);
          break;
        case "arrowright":
        case " ":
          event.preventDefault();
          if (currentIndex < questions.length - 1) goToQuestion(currentIndex + 1);
          else setShowConfirmSubmit(true);
          break;
        case "f":
          event.preventDefault();
          toggleFlag(q.id);
          break;
        case "m":
          event.preventDefault();
          setFocusMode((v) => !v);
          break;
        case "t":
          event.preventDefault();
          setHideTimer((v) => !v);
          break;
        case "enter":
          event.preventDefault();
          if (currentIndex === questions.length - 1) setShowConfirmSubmit(true);
          break;
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quizStarted, loading, error, showConfirmSubmit, currentIndex, questions]);

  const recordTimeOnQuestion = useCallback(() => {
    if (!questions[currentIndex]) return;
    const qId = questions[currentIndex].id;
    const elapsed = Math.floor((Date.now() - questionStartTime.current) / 1000);
    setAnswers((prev) => ({
      ...prev,
      [qId]: {
        ...prev[qId],
        timeSpentSeconds: (prev[qId]?.timeSpentSeconds || 0) + elapsed,
      },
    }));
    questionStartTime.current = Date.now();
  }, [currentIndex, questions]);

  function selectAnswer(questionId: string, answer: string) {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: {
        ...prev[questionId],
        selectedAnswer:
          prev[questionId]?.selectedAnswer === answer ? null : answer,
      },
    }));
  }

  function toggleFlag(questionId: string) {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: {
        ...prev[questionId],
        flaggedForReview: !prev[questionId]?.flaggedForReview,
      },
    }));
  }

  function goToQuestion(index: number) {
    recordTimeOnQuestion();
    setCurrentIndex(index);
    const q = questions[index];
    if (q) setActiveSubject(q.subjectCode);
  }

  async function handleSubmit() {
    if (submitting) return;
    setSubmitting(true);
    recordTimeOnQuestion();

    try {
      const submissionAnswers = questions.map((q) => ({
        questionId: q.id,
        selectedAnswer: answerRef.current[q.id]?.selectedAnswer || null,
        timeSpentSeconds: answerRef.current[q.id]?.timeSpentSeconds || 0,
        flaggedForReview: answerRef.current[q.id]?.flaggedForReview || false,
      }));

      const res = await fetch("/api/assessments/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attemptId, answers: submissionAnswers }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to submit.");
        setSubmitting(false);
        return;
      }

      router.push(`/practice/results/${attemptId}`);
    } catch {
      setError("Failed to submit. Please try again.");
      setSubmitting(false);
    }
  }

  function formatTime(seconds: number) {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, "0")}:${secs
        .toString()
        .padStart(2, "0")}`;
    }
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }

  const answeredCount = Object.values(answers).filter(
    (a) => a.selectedAnswer !== null,
  ).length;
  const flaggedCount = Object.values(answers).filter(
    (a) => a.flaggedForReview,
  ).length;
  const currentQuestion = questions[currentIndex];
  const unanswered = questions.length - answeredCount;
  const lowTime = timeRemaining < 300 && timeRemaining > 0;

  if (loading || generating) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="h-10 w-10 rounded-full border-[3px] border-primary/25 border-t-primary animate-spin" />
        <p className="mt-4 text-sm text-muted animate-pulse">
          {generating ? "Building your exam…" : "Loading…"}
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-md py-20 text-center animate-fade-in">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-warning-soft text-warning">
          <LuTriangleAlert className="h-7 w-7" />
        </div>
        <h2 className="text-lg font-bold text-foreground">
          Something went wrong
        </h2>
        <p className="mt-1 text-sm text-muted">{error}</p>
        <Button className="mt-5" onClick={() => router.back()}>
          Go Back
        </Button>
      </div>
    );
  }

  return (
    <div className={cn("mx-auto", focusMode ? "max-w-2xl" : "max-w-5xl")}>
      {/* Header */}
      <div className="sticky-chrome -mx-4 px-4 pb-4 sm:-mx-6 sm:px-6">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-base font-bold text-foreground md:text-lg">
              {title}
            </h1>
            <p className="text-xs text-muted">
              {currentQuestion
                ? `${currentQuestion.subjectName} · Question ${currentIndex + 1} of ${questions.length}`
                : ""}
            </p>
          </div>

          <div className="flex flex-shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setHideTimer((v) => !v)}
              aria-pressed={hideTimer}
              aria-label={hideTimer ? "Show timer" : "Hide timer"}
              title="Hide timer (T)"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-muted transition-colors hover:border-primary/40 hover:text-primary"
            >
              {hideTimer ? (
                <LuEyeOff className="h-4 w-4" />
              ) : (
                <LuEye className="h-4 w-4" />
              )}
            </button>

            {!hideTimer && (
              <div
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-bold tabular-nums transition-colors",
                  lowTime
                    ? "bg-danger-soft text-danger animate-pulse"
                    : "bg-primary-soft text-primary-soft-foreground",
                )}
              >
                <LuClock className="h-4 w-4" />
                {formatTime(timeRemaining)}
              </div>
            )}

            <button
              type="button"
              onClick={() => setFocusMode((v) => !v)}
              aria-pressed={focusMode}
              aria-label={focusMode ? "Exit focus mode" : "Enter focus mode"}
              title="Focus mode (M)"
              className={cn(
                "flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-bold transition-colors",
                focusMode
                  ? "border-primary/30 bg-primary-soft text-primary"
                  : "border-border bg-card text-muted hover:border-primary/40 hover:text-primary",
              )}
            >
              <LuFocus className="h-4 w-4" />
              <span className="hidden sm:inline">
                {focusMode ? "Focus on" : "Focus"}
              </span>
            </button>
          </div>
        </div>

        <div className="mt-3">
          <Progress
            value={(answeredCount / questions.length) * 100}
            className="h-1.5"
          />
          <div className="mt-1.5 flex justify-between text-xs text-muted">
            <span className="font-semibold text-primary">
              {answeredCount} answered
            </span>
            {flaggedCount > 0 && (
              <span className="font-semibold text-warning">
                {flaggedCount} flagged
              </span>
            )}
            <span>{unanswered} remaining</span>
          </div>
        </div>

        {/* Subject tabs */}
        {subjectGroups.length > 1 && (
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {subjectGroups.map((group) => {
              const groupAnswered = group.questions.filter(
                (q) => answers[q.id]?.selectedAnswer !== null,
              ).length;
              const isActive = activeSubject === group.code;
              return (
                <button
                  key={group.code}
                  type="button"
                  onClick={() => {
                    const idx = questions.findIndex(
                      (q) => q.subjectCode === group.code,
                    );
                    if (idx >= 0) goToQuestion(idx);
                  }}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold whitespace-nowrap transition-colors",
                    isActive
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card text-muted hover:border-primary/30",
                  )}
                >
                  <LuBookOpen className="h-3.5 w-3.5" />
                  {group.code}
                  <span className="opacity-70">
                    ({groupAnswered}/{group.questions.length})
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div
        className={cn(
          "mt-6 grid gap-6",
          focusMode ? "grid-cols-1" : "grid-cols-1 lg:grid-cols-[1fr_220px]",
        )}
      >
        {/* Question area */}
        <div className="card p-5 md:p-7">
          {currentQuestion && (
            <div key={currentQuestion.id} className="animate-slide-up">
              <div className="mb-5">
                <div className="flex items-start justify-between gap-4">
                  <h2
                    className={cn(
                      "font-medium leading-relaxed text-foreground",
                      focusMode ? "text-lg md:text-xl" : "text-base",
                    )}
                  >
                    <span className="mr-2 inline-flex h-7 w-7 items-center justify-center rounded-lg bg-primary-soft text-sm font-bold text-primary">
                      {currentIndex + 1}
                    </span>
                    {currentQuestion.questionText}
                  </h2>
                  <button
                    type="button"
                    onClick={() => toggleFlag(currentQuestion.id)}
                    aria-pressed={answers[currentQuestion.id]?.flaggedForReview}
                    aria-label="Flag for review"
                    title="Flag for review (F)"
                    className={cn(
                      "flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border transition-colors",
                      answers[currentQuestion.id]?.flaggedForReview
                        ? "border-amber-300 bg-amber-50 text-warning"
                        : "border-border text-muted hover:bg-secondary",
                    )}
                  >
                    <LuFlag className="h-4 w-4" />
                  </button>
                </div>

                {currentQuestion.questionImageUrl && (
                  <div className="mt-4 overflow-hidden rounded-xl border border-border">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={currentQuestion.questionImageUrl}
                      alt="Question illustration"
                      className="h-auto max-w-full"
                    />
                  </div>
                )}
              </div>

              {currentQuestion.options && (
                <div className="space-y-3" role="group" aria-label="Answer options">
                  {Object.entries(currentQuestion.options).map(([key, value]) => {
                    const isSelected =
                      answers[currentQuestion.id]?.selectedAnswer === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => selectAnswer(currentQuestion.id, key)}
                        aria-pressed={isSelected}
                        className={cn(
                          "group flex w-full items-center gap-3 rounded-xl border p-3.5 text-left transition-all",
                          isSelected
                            ? "border-primary bg-primary-soft ring-4 ring-primary/15"
                            : "border-border bg-card hover:border-primary/40 hover:bg-primary-soft/50",
                        )}
                      >
                        <span
                          className={cn(
                            "flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold transition-colors",
                            isSelected
                              ? "bg-primary text-white"
                              : "bg-secondary text-foreground group-hover:bg-primary/10",
                          )}
                        >
                          {key}
                        </span>
                        <span
                          className={cn(
                            "flex-1 pt-0.5",
                            focusMode ? "text-base" : "text-sm",
                            isSelected
                              ? "font-semibold text-foreground"
                              : "text-foreground",
                          )}
                        >
                          {value as string}
                        </span>
                        {isSelected && (
                          <LuCheck className="h-5 w-5 flex-shrink-0 text-primary" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="mt-8 flex items-center justify-between border-t border-border pt-5">
                <Button
                  variant="ghost"
                  onClick={() => goToQuestion(currentIndex - 1)}
                  disabled={currentIndex === 0}
                >
                  <LuChevronLeft className="h-4 w-4" />
                  Previous
                </Button>

                {currentIndex === questions.length - 1 ? (
                  <Button
                    variant="success"
                    onClick={() => setShowConfirmSubmit(true)}
                  >
                    <LuCheck className="h-4 w-4" />
                    Finish Exam
                  </Button>
                ) : (
                  <Button
                    variant="primary"
                    onClick={() => goToQuestion(currentIndex + 1)}
                  >
                    Next
                    <LuChevronRight className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Question navigator (desktop) */}
        {!focusMode && (
          <div className="hidden lg:block">
            <div className="sticky top-28 card max-h-[calc(100vh-12rem)] overflow-y-auto p-4">
              <h3 className="section-label mb-3">Questions</h3>

              {subjectGroups.map((group) => (
                <div key={group.code} className="mb-3">
                  <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted">
                    {group.name}
                  </p>
                  <div className="grid grid-cols-5 gap-1.5">
                    {group.questions.map((q) => {
                      const i = questions.indexOf(q);
                      const answer = answers[q.id];
                      const isCurrent = i === currentIndex;
                      const isAnswered = answer?.selectedAnswer !== null;
                      const isFlagged = answer?.flaggedForReview;
                      return (
                        <button
                          key={q.id}
                          type="button"
                          onClick={() => goToQuestion(i)}
                          aria-label={`Question ${i + 1}${isAnswered ? ", answered" : ""}`}
                          className={cn(
                            "relative h-7 w-7 rounded text-[11px] font-semibold transition-all",
                            isCurrent
                              ? "bg-primary text-white ring-2 ring-primary/30"
                              : isAnswered
                                ? "bg-success-soft text-success hover:bg-green-100"
                                : "bg-secondary text-muted hover:bg-border",
                          )}
                        >
                          {i + 1}
                          {isFlagged && (
                            <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-warning ring-2 ring-card" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}

              <div className="mt-3 space-y-1.5 border-t border-border pt-3 text-xs text-muted">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded bg-success-soft" />
                  Answered ({answeredCount})
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded bg-secondary" />
                  Unanswered ({unanswered})
                </div>
                {flaggedCount > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded bg-warning" />
                    Flagged ({flaggedCount})
                  </div>
                )}
              </div>

              <Button
                variant="success"
                className="mt-4 w-full"
                onClick={() => setShowConfirmSubmit(true)}
              >
                Submit Exam
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Mobile bottom bar */}
      <div className="fixed inset-x-0 bottom-16 z-40 border-t border-border bg-card/95 p-3 backdrop-blur-md lg:hidden">
        <div className="flex items-center justify-between gap-3">
          <Button
            variant="outline"
            size="icon"
            onClick={() => goToQuestion(currentIndex - 1)}
            disabled={currentIndex === 0}
            aria-label="Previous question"
          >
            <LuChevronLeft className="h-5 w-5" />
          </Button>

          <button
            type="button"
            onClick={() => setFocusMode((v) => !v)}
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-lg border transition-colors",
              focusMode
                ? "border-primary/30 bg-primary-soft text-primary"
                : "border-border text-muted",
            )}
            aria-label={focusMode ? "Exit focus mode" : "Enter focus mode"}
          >
            <LuFocus className="h-4 w-4" />
          </button>

          <div className="text-center text-xs font-semibold text-muted">
            {answeredCount}/{questions.length} answered
          </div>

          {currentIndex === questions.length - 1 ? (
            <Button
              variant="success"
              size="sm"
              onClick={() => setShowConfirmSubmit(true)}
            >
              Submit
            </Button>
          ) : (
            <Button
              variant="outline"
              size="icon"
              onClick={() => goToQuestion(currentIndex + 1)}
              aria-label="Next question"
            >
              <LuChevronRight className="h-5 w-5" />
            </Button>
          )}
        </div>
      </div>

      {/* Confirm submit modal */}
      {showConfirmSubmit && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Submit exam"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setShowConfirmSubmit(false);
          }}
        >
          <div className="w-full max-w-sm rounded-2xl bg-card p-6 shadow-lift animate-pop">
            <h3 className="text-lg font-bold text-foreground">
              Submit {examType} Exam?
            </h3>
            <div className="mt-3 space-y-2">
              <p className="text-sm text-muted">
                You answered{" "}
                <span className="font-bold text-foreground">{answeredCount}</span>{" "}
                of{" "}
                <span className="font-bold text-foreground">
                  {questions.length}
                </span>{" "}
                questions.
              </p>
              {unanswered > 0 && (
                <p className="rounded-lg bg-warning-soft px-3 py-2 text-sm font-medium text-warning">
                  {unanswered} unanswered{" "}
                  {unanswered === 1 ? "question is" : "questions are"} left blank.
                </p>
              )}
              {flaggedCount > 0 && (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-700">
                  {flaggedCount} flagged for review.
                </p>
              )}
              {subjectGroups.length > 1 && (
                <div className="mt-2 space-y-1 border-t border-border pt-2 text-xs text-muted">
                  {subjectGroups.map((g) => {
                    const ga = g.questions.filter(
                      (q) => answers[q.id]?.selectedAnswer !== null,
                    ).length;
                    return (
                      <p key={g.code}>
                        {g.code}: {ga}/{g.questions.length}
                      </p>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="mt-6 flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setShowConfirmSubmit(false)}
              >
                Keep going
              </Button>
              <Button
                variant="success"
                className="flex-1"
                disabled={submitting}
                onClick={handleSubmit}
              >
                {submitting ? "Submitting…" : "Submit"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function MockExamSessionPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 rounded-full border-2 border-primary/25 border-t-primary animate-spin" />
        </div>
      }
    >
      <MockExamSession />
    </Suspense>
  );
}
