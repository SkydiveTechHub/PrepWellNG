"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  LuCheck,
  LuChevronLeft,
  LuChevronRight,
  LuClock,
  LuLoader,
  LuLock,
  LuSparkles,
  LuTriangleAlert,
  LuX,
} from "react-icons/lu";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type PretestQuestion = {
  id: string;
  questionNumber: number;
  questionText: string;
  options: Record<string, string> | null;
  marks: number;
};

type PretestResult = {
  passed: boolean;
  percentage: number;
  correctCount: number;
  totalQuestions: number;
  threshold: number;
};

type PretestDialogProps = {
  topicId: string;
  topicTitle: string;
  alreadyPassed: boolean;
  /** Called after a passing submission so the server page can re-derive state. */
  onPassed?: () => void;
};

type Phase = "intro" | "quiz" | "result";

export function PretestDialog({
  topicId,
  topicTitle,
  alreadyPassed,
  onPassed,
}: PretestDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("intro");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [attemptId, setAttemptId] = useState("");
  const [questions, setQuestions] = useState<PretestQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [result, setResult] = useState<PretestResult | null>(null);

  const answeredCount = Object.values(answers).filter(Boolean).length;
  const currentQuestion = questions[currentIndex];

  function reset() {
    setPhase("intro");
    setLoading(false);
    setSubmitting(false);
    setError("");
    setAttemptId("");
    setQuestions([]);
    setAnswers({});
    setCurrentIndex(0);
    setResult(null);
  }

  function close() {
    setOpen(false);
    reset();
  }

  async function start() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/learning-path/topics/${topicId}/pretest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to start the pretest.");
        return;
      }
      const data = await res.json();
      setAttemptId(data.attemptId);
      setQuestions(data.questions);
      setPhase("quiz");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function selectAnswer(questionId: string, answer: string) {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: prev[questionId] === answer ? "" : answer,
    }));
  }

  async function submit() {
    if (submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const payload = questions.map((q) => ({
        questionId: q.id,
        selectedAnswer: answers[q.id] || null,
        timeSpentSeconds: 0,
      }));
      const res = await fetch(`/api/learning-path/topics/${topicId}/pretest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attemptId, answers: payload }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to submit the pretest.");
        return;
      }
      const data = await res.json();
      setResult({
        passed: data.passed,
        percentage: data.percentage,
        correctCount: data.correctCount,
        totalQuestions: data.totalQuestions,
        threshold: data.threshold,
      });
      setPhase("result");
      if (data.passed) {
        router.refresh();
        if (onPassed) onPassed();
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-primary/40 bg-primary-soft/60 px-3 py-2 text-sm font-semibold text-primary transition-colors hover:border-primary/70 hover:bg-primary-soft"
      >
        <LuSparkles className="h-4 w-4" />
        Not sure you know this? Take readiness pretest
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Readiness pretest"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !submitting) close();
          }}
        >
          <div className="w-full max-w-lg rounded-2xl bg-card p-6 shadow-lift animate-pop">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold tracking-tight text-foreground">
                  Readiness pretest
                </h3>
                <p className="mt-0.5 text-sm text-muted">{topicTitle}</p>
              </div>
              <button
                type="button"
                onClick={close}
                disabled={submitting}
                aria-label="Close"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted transition-colors hover:bg-secondary disabled:opacity-50"
              >
                <LuX className="h-4 w-4" />
              </button>
            </div>

            {error && (
              <p className="mt-4 flex items-center gap-2 rounded-lg bg-danger-soft px-3 py-2 text-sm font-medium text-danger">
                <LuTriangleAlert className="h-4 w-4 flex-shrink-0" />
                {error}
              </p>
            )}

            {phase === "intro" && (
              <div className="mt-5">
                <div className="flex flex-wrap gap-2">
                  <span className="chip border border-border bg-secondary text-muted">
                    <LuClock className="h-3.5 w-3.5" />
                    5 questions
                  </span>
                  <span className="chip border border-success/30 bg-success-soft text-success">
                    <LuCheck className="h-3.5 w-3.5" />
                    Pass at 80%
                  </span>
                </div>
                <p className="mt-4 text-sm leading-relaxed text-muted">
                  {alreadyPassed
                    ? "You have already passed this readiness pretest. It stays on your record, so you can skip the lesson grind for this topic."
                    : "Answer 5 questions from this topic. Score 80% or higher to certify it — the lessons are then treated as known and its dependents unlock."}
                </p>
                <div className="mt-6 flex gap-3">
                  <Button variant="outline" className="flex-1" onClick={close}>
                    {alreadyPassed ? "Close" : "Not now"}
                  </Button>
                  {!alreadyPassed && (
                    <Button
                      variant="primary"
                      className="flex-1"
                      disabled={loading}
                      onClick={start}
                    >
                      {loading ? (
                        <LuLoader className="h-4 w-4 animate-spin" />
                      ) : (
                        <LuSparkles className="h-4 w-4" />
                      )}
                      Start pretest
                    </Button>
                  )}
                </div>
              </div>
            )}

            {phase === "quiz" && currentQuestion && (
              <div className="mt-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold text-muted">
                    Question {currentIndex + 1} of {questions.length}
                  </p>
                  <p className="text-xs font-semibold text-primary">
                    {answeredCount} answered
                  </p>
                </div>
                <div className="mb-5 h-1.5 overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{
                      width: `${((currentIndex + 1) / questions.length) * 100}%`,
                    }}
                  />
                </div>

                <h4 className="text-sm font-medium leading-relaxed text-foreground">
                  <span className="mr-2 inline-flex h-7 w-7 items-center justify-center rounded-lg bg-primary-soft text-sm font-bold text-primary">
                    {currentIndex + 1}
                  </span>
                  {currentQuestion.questionText}
                </h4>

                {currentQuestion.options && (
                  <div className="mt-4 space-y-2.5">
                    {Object.entries(currentQuestion.options).map(([key, value]) => {
                      const isSelected = answers[currentQuestion.id] === key;
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => selectAnswer(currentQuestion.id, key)}
                          aria-pressed={isSelected}
                          className={cn(
                            "group flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-all",
                            isSelected
                              ? "border-primary bg-primary-soft ring-4 ring-primary/15"
                              : "border-border bg-card hover:border-primary/40",
                          )}
                        >
                          <span
                            className={cn(
                              "flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold",
                              isSelected
                                ? "bg-primary text-white"
                                : "bg-secondary text-foreground",
                            )}
                          >
                            {key}
                          </span>
                          <span
                            className={cn(
                              "flex-1 text-sm",
                              isSelected ? "font-semibold" : "text-foreground",
                            )}
                          >
                            {value as string}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="mt-6 flex items-center justify-between border-t border-border pt-4">
                  <Button
                    variant="ghost"
                    onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
                    disabled={currentIndex === 0}
                  >
                    <LuChevronLeft className="h-4 w-4" />
                    Previous
                  </Button>
                  {currentIndex === questions.length - 1 ? (
                    <Button
                      variant="success"
                      disabled={submitting}
                      onClick={submit}
                    >
                      {submitting ? (
                        <LuLoader className="h-4 w-4 animate-spin" />
                      ) : (
                        <LuCheck className="h-4 w-4" />
                      )}
                      Finish pretest
                    </Button>
                  ) : (
                    <Button
                      variant="primary"
                      onClick={() => setCurrentIndex((i) => i + 1)}
                    >
                      Next
                      <LuChevronRight className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            )}

            {phase === "result" && result && (
              <div className="mt-5 text-center">
                <div
                  className={cn(
                    "mx-auto flex h-14 w-14 items-center justify-center rounded-2xl",
                    result.passed
                      ? "bg-success-soft text-success"
                      : "bg-warning-soft text-warning",
                  )}
                >
                  {result.passed ? (
                    <LuCheck className="h-7 w-7" />
                  ) : (
                    <LuLock className="h-7 w-7" />
                  )}
                </div>
                <h4
                  className={cn(
                    "mt-3 text-lg font-bold tracking-tight",
                    result.passed ? "text-success" : "text-warning",
                  )}
                >
                  {result.passed ? "Pretest passed!" : "Not quite yet"}
                </h4>
                <p className="mt-1 text-sm text-muted">
                  You scored{" "}
                  <span className="font-bold text-foreground">
                    {result.correctCount}/{result.totalQuestions}
                  </span>{" "}
                  ({result.percentage}%) — you need {result.threshold}% to pass.
                </p>
                {result.passed ? (
                  <p className="mt-2 text-sm text-success">
                    {topicTitle} is now certified. Its dependents are unlocked.
                  </p>
                ) : (
                  <p className="mt-2 text-sm text-muted">
                    Try the lessons first, then come back to retake it.
                  </p>
                )}
                <div className="mt-6 flex gap-3">
                  <Button variant="outline" className="flex-1" onClick={close}>
                    Close
                  </Button>
                  {!result.passed && (
                    <Button variant="primary" className="flex-1" onClick={start}>
                      Retake
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
