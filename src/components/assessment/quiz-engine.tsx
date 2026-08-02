"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  LuClock,
  LuChevronLeft,
  LuChevronRight,
  LuFlag,
  LuCheck,
  LuTriangleAlert,
  LuFocus,
  LuEye,
  LuEyeOff,
  LuKeyboard,
} from "react-icons/lu";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

type QuestionData = {
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
};

type AnswerState = {
  selectedAnswer: string | null;
  timeSpentSeconds: number;
  flaggedForReview: boolean;
};

type QuizEngineProps = {
  subjectSlug: string;
  topicSlug?: string;
  examType?: string;
  count?: number;
  backHref?: string;
  title?: string;
  resultHref?: (attemptId: string) => string;
};

export function QuizEngine({
  subjectSlug,
  topicSlug,
  examType = "",
  count = 10,
  backHref,
  title: titleOverride,
  resultHref,
}: QuizEngineProps) {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [showConfirmSubmit, setShowConfirmSubmit] = useState(false);

  // Quiz state
  const [attemptId, setAttemptId] = useState("");
  const [title, setTitle] = useState("");
  const [questions, setQuestions] = useState<QuestionData[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, AnswerState>>({});
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [quizStarted, setQuizStarted] = useState(false);

  // Learner preferences
  const [focusMode, setFocusMode] = useState(false);
  const [hideTimer, setHideTimer] = useState(false);

  const questionStartTime = useRef(Date.now());
  const answerRef = useRef<Record<string, AnswerState>>({});
  answerRef.current = answers;

  // Generate quiz on mount
  useEffect(() => {
    async function generateQuiz() {
      setLoading(true);
      try {
        let subjectId = "";
        let topicIds: string[] | undefined;

        if (topicSlug) {
          const topicRes = await fetch(
            `/api/subjects/${subjectSlug}/topics/${topicSlug}`,
          );
          if (!topicRes.ok) {
            setError("Topic not found.");
            return;
          }
          const topicData = await topicRes.json();
          subjectId = topicData.subjectId;
          topicIds = [topicData.topicId];
        } else {
          const subjectsRes = await fetch("/api/subjects");
          const subjectsData = await subjectsRes.json();
          const subject = (subjectsData.subjects || []).find(
            (s: { slug: string }) => s.slug === subjectSlug,
          );
          if (!subject) {
            setError("Subject not found.");
            return;
          }
          subjectId = subject.id;
        }

        const body: Record<string, unknown> = {
          subjectId,
          count,
        };
        if (topicIds) body.topicIds = topicIds;
        if (examType) body.examType = examType;
        if (titleOverride) body.title = titleOverride;

        const res = await fetch("/api/assessments/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const data = await res.json();
          setError(data.error || "Failed to generate quiz.");
          return;
        }

        const data = await res.json();
        setAttemptId(data.attemptId);
        setTitle(data.title);
        setQuestions(data.questions);
        setTimeRemaining((data.timeLimitMinutes || 60) * 60);

        const initialAnswers: Record<string, AnswerState> = {};
        for (const q of data.questions) {
          initialAnswers[q.id] = {
            selectedAnswer: null,
            timeSpentSeconds: 0,
            flaggedForReview: false,
          };
        }
        setAnswers(initialAnswers);
        setQuizStarted(true);
      } catch {
        setError("Network error. Please try again.");
      } finally {
        setLoading(false);
      }
    }

    generateQuiz();
  }, [subjectSlug, topicSlug, examType, count, titleOverride]);

  // Timer
  useEffect(() => {
    if (!quizStarted || timeRemaining <= 0) return;
    const interval = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          handleSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

      // A–E select an option
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

  // Track time per question
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
        body: JSON.stringify({
          attemptId,
          answers: submissionAnswers,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to submit.");
        setSubmitting(false);
        return;
      }

      if (resultHref) {
        router.push(resultHref(attemptId));
      } else {
        router.push(`/practice/results/${attemptId}`);
      }
    } catch {
      setError("Failed to submit. Please try again.");
      setSubmitting(false);
    }
  }

  // Format time
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

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="h-10 w-10 rounded-full border-[3px] border-primary/25 border-t-primary animate-spin" />
        <p className="mt-4 text-sm text-muted animate-pulse">
          Preparing your quiz…
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
        <Button
          className="mt-5"
          onClick={() => (backHref ? router.push(backHref) : router.back())}
        >
          Go Back
        </Button>
      </div>
    );
  }

  return (
    <div className={cn("mx-auto", focusMode ? "max-w-2xl" : "max-w-4xl")}>
      {/* Header */}
      <div className="sticky-chrome -mx-4 px-4 pb-4 sm:-mx-6 sm:px-6">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-base font-bold text-foreground md:text-lg">
              {title}
            </h1>
            <p className="text-xs text-muted">
              {examType && `${examType} · `}Question {currentIndex + 1} of{" "}
              {questions.length}
            </p>
          </div>

          <div className="flex flex-shrink-0 items-center gap-2">
            {/* Hide / show timer */}
            <button
              type="button"
              onClick={() => setHideTimer((v) => !v)}
              aria-pressed={hideTimer}
              aria-label={hideTimer ? "Show timer" : "Hide timer"}
              title="Hide timer (T)"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-muted transition-colors hover:border-primary/40 hover:text-primary"
            >
              {hideTimer ? <LuEyeOff className="h-4 w-4" /> : <LuEye className="h-4 w-4" />}
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

            {/* Focus mode */}
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

        {/* Progress */}
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
      </div>

      <div
        className={cn(
          "mt-6 grid gap-6",
          focusMode ? "grid-cols-1" : "grid-cols-1 lg:grid-cols-[1fr_200px]",
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
                    aria-label={
                      answers[currentQuestion.id]?.flaggedForReview
                        ? "Remove flag"
                        : "Flag for review"
                    }
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

              {/* Options */}
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
                            "flex-1 pt-0.5 text-sm",
                            focusMode ? "text-base" : "text-sm",
                            isSelected ? "font-semibold text-foreground" : "text-foreground",
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

              {/* Navigation */}
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
                  <Button variant="success" onClick={() => setShowConfirmSubmit(true)}>
                    <LuCheck className="h-4 w-4" />
                    Finish Quiz
                  </Button>
                ) : (
                  <Button variant="primary" onClick={() => goToQuestion(currentIndex + 1)}>
                    Next
                    <LuChevronRight className="h-4 w-4" />
                  </Button>
                )}
              </div>

              {!focusMode && (
                <p className="mt-5 flex items-center justify-center gap-1.5 text-center text-[11px] text-muted">
                  <LuKeyboard className="h-3.5 w-3.5" />
                  Shortcuts: A–E answer · ← → move · F flag · M focus · T timer
                </p>
              )}
            </div>
          )}
        </div>

        {/* Question navigator (desktop) */}
        {!focusMode && (
          <div className="hidden lg:block">
            <div className="sticky top-28 card p-4">
              <h3 className="section-label mb-3">Questions</h3>
              <div className="grid grid-cols-5 gap-1.5">
                {questions.map((q, i) => {
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
                        "relative h-8 w-8 rounded-lg text-xs font-semibold transition-all",
                        isCurrent
                          ? "bg-primary text-white ring-2 ring-primary/30"
                          : isAnswered
                            ? "bg-success-soft text-success hover:bg-green-100"
                            : "bg-secondary text-muted hover:bg-border",
                      )}
                    >
                      {i + 1}
                      {isFlagged && (
                        <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-warning ring-2 ring-card" />
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="mt-4 space-y-1.5 border-t border-border pt-3 text-xs text-muted">
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
                Submit Quiz
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
            <Button variant="success" size="sm" onClick={() => setShowConfirmSubmit(true)}>
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
          aria-label="Submit quiz"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setShowConfirmSubmit(false);
          }}
        >
          <div className="w-full max-w-sm rounded-2xl bg-card p-6 shadow-lift animate-pop">
            <h3 className="text-lg font-bold text-foreground">Submit Quiz?</h3>
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
                  {unanswered} unanswered {unanswered === 1 ? "question is" : "questions are"} left blank.
                </p>
              )}
              {flaggedCount > 0 && (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-700">
                  {flaggedCount} flagged for review.
                </p>
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
