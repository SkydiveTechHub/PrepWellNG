"use client";

import { useEffect, useRef, type ReactNode } from "react";
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
  LuRotateCcw,
} from "react-icons/lu";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { QuestionImage } from "@/components/ui/question-image";
import { formatExamTime, type ExamSession } from "./use-exam-session";
import { Modal } from "@/components/ui/modal";
import { useNavigationGuard } from "./use-navigation-guard";

/** A named block of questions in the navigator — one per subject on a mock exam. */
export type QuestionGroup = {
  key: string;
  label: string;
  questionIds: string[];
};

type ExamSurfaceProps = {
  session: ExamSession;
  /** Shown under the title, e.g. "JAMB" or the current subject. */
  eyebrow?: string;
  backHref?: string;
  /** Splits the navigator and adds jump tabs. Omit for a single-subject quiz. */
  groups?: QuestionGroup[];
  showShortcutHint?: boolean;
  confirmTitle?: string;
  /** Extra rows inside the confirm dialog, e.g. per-subject answered counts. */
  confirmExtra?: ReactNode;
};

export function ExamSurface({
  session,
  eyebrow,
  backHref,
  groups,
  showShortcutHint = true,
  confirmTitle = "Submit Quiz?",
  confirmExtra,
}: ExamSurfaceProps) {
  const router = useRouter();
  const {
    loading,
    error,
    submitError,
    submitting,
    resumed,
    attemptId,
    title,
    questions,
    currentIndex,
    currentQuestion,
    answers,
    timeRemaining,
    deadlineAt,
    showConfirmSubmit,
    focusMode,
    hideTimer,
    indexById,
    answeredCount,
    flaggedCount,
    unanswered,
    progressPercent,
    lowTime,
    setShowConfirmSubmit,
    setFocusMode,
    setHideTimer,
    selectAnswer,
    toggleFlag,
    goToQuestion,
    handleSubmit,
    isAnswered,
  } = session;
  const untimed = deadlineAt == null;

  // `armed` covers the whole life of the attempt, including the submit
  // request itself — the history sentinel must stay in place until the
  // student actually lands on results. `active` stands down for that same
  // window so the student can navigate the confirmation UI a slow or failed
  // submit produces; that navigation to the results page is the one
  // departure we must not interrupt.
  const { pending, confirmLeave, cancelLeave } = useNavigationGuard({
    armed: Boolean(attemptId),
    active: Boolean(attemptId) && !submitting,
    fallbackHref: backHref ?? "/practice",
  });

  // ── Keyboard shortcuts ───────────────────────────────────
  useEffect(() => {
    if (loading || error || showConfirmSubmit) return;

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
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const q = questions[currentIndex];
      if (!q) return;

      const key = event.key.toLowerCase();
      const letter = /^[a-e]$/.test(key) ? key.toUpperCase() : null;
      if (letter && q.options && Object.keys(q.options).includes(letter)) {
        event.preventDefault();
        selectAnswer(q.id, letter);
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
          if (untimed) break;
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
  }, [
    loading,
    error,
    showConfirmSubmit,
    questions,
    currentIndex,
    selectAnswer,
    toggleFlag,
    goToQuestion,
    setShowConfirmSubmit,
    setFocusMode,
    setHideTimer,
    untimed,
  ]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-primary/25 border-t-primary" />
        <p className="mt-4 animate-pulse text-sm text-muted">
          Preparing your questions…
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

  const navigatorGroups: QuestionGroup[] =
    groups && groups.length > 0
      ? groups
      : [{ key: "all", label: "Questions", questionIds: questions.map((q) => q.id) }];

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
              {eyebrow && `${eyebrow} · `}Question {currentIndex + 1} of{" "}
              {questions.length}
            </p>
          </div>

          <div className="flex flex-shrink-0 items-center gap-2">
            {!untimed && (
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
            )}

            {!untimed && !hideTimer && (
              <div
                role="timer"
                aria-live="off"
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-bold tabular-nums transition-colors",
                  lowTime
                    ? "animate-pulse bg-danger-soft text-danger"
                    : "bg-primary-soft text-primary-soft-foreground",
                )}
              >
                <LuClock className="h-4 w-4" />
                {formatExamTime(timeRemaining)}
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

        {/* Progress */}
        <div className="mt-3">
          <Progress value={progressPercent} className="h-1.5" />
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

        {/* Subject jump tabs */}
        {groups && groups.length > 1 && (
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {groups.map((group) => {
              const answeredInGroup = group.questionIds.filter((id) =>
                isAnswered(id),
              ).length;
              const active = group.questionIds.includes(
                questions[currentIndex]?.id,
              );
              return (
                <button
                  key={group.key}
                  type="button"
                  onClick={() => {
                    const first = group.questionIds[0];
                    const idx = first != null ? indexById.get(first) : undefined;
                    if (idx != null) goToQuestion(idx);
                  }}
                  className={cn(
                    "flex items-center gap-1.5 whitespace-nowrap rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors",
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card text-muted hover:border-primary/30",
                  )}
                >
                  {group.key}
                  <span className="opacity-70">
                    ({answeredInGroup}/{group.questionIds.length})
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {resumed && (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-primary/20 bg-primary-soft px-3.5 py-2.5 text-sm text-primary-soft-foreground">
          <LuRotateCcw className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>
            Picked up where you left off — your answers and remaining time were
            saved.
          </span>
        </div>
      )}

      {submitError && (
        <div
          role="alert"
          className="mt-4 flex items-start gap-2 rounded-xl border border-danger/25 bg-danger-soft px-3.5 py-2.5 text-sm font-medium text-danger"
        >
          <LuTriangleAlert className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>{submitError}</span>
        </div>
      )}

      <div
        className={cn(
          "mt-6 grid gap-6",
          focusMode ? "grid-cols-1" : "grid-cols-1 lg:grid-cols-[1fr_220px]",
        )}
      >
        {/* Question */}
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
                    aria-pressed={Boolean(
                      answers[currentQuestion.id]?.flaggedForReview,
                    )}
                    aria-label={
                      answers[currentQuestion.id]?.flaggedForReview
                        ? "Remove flag"
                        : "Flag for review"
                    }
                    title="Flag for review (F)"
                    className={cn(
                      "flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border transition-colors",
                      answers[currentQuestion.id]?.flaggedForReview
                        ? "border-warning/40 bg-warning-soft text-warning"
                        : "border-border text-muted hover:bg-secondary",
                    )}
                  >
                    <LuFlag className="h-4 w-4" />
                  </button>
                </div>

                {currentQuestion.questionImageUrl && (
                  <QuestionImage
                    src={currentQuestion.questionImageUrl}
                    alt="Diagram for this question"
                    className="mt-4"
                  />
                )}
              </div>

              {currentQuestion.options && (
                <div className="space-y-3" role="group" aria-label="Answer options">
                  {Object.entries(currentQuestion.options).map(([key, value]) => {
                    const selected =
                      answers[currentQuestion.id]?.selectedAnswer === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => selectAnswer(currentQuestion.id, key)}
                        aria-pressed={selected}
                        className={cn(
                          "group flex w-full items-center gap-3 rounded-xl border p-3.5 text-left transition-all",
                          selected
                            ? "border-primary bg-primary-soft ring-4 ring-primary/15"
                            : "border-border bg-card hover:border-primary/40 hover:bg-primary-soft/50",
                        )}
                      >
                        <span
                          className={cn(
                            "flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold transition-colors",
                            selected
                              ? "bg-primary text-primary-foreground"
                              : "bg-secondary text-foreground group-hover:bg-primary/10",
                          )}
                        >
                          {key}
                        </span>
                        <span
                          className={cn(
                            "flex-1 pt-0.5",
                            focusMode ? "text-base" : "text-sm",
                            selected
                              ? "font-semibold text-foreground"
                              : "text-foreground",
                          )}
                        >
                          {value}
                        </span>
                        {selected && (
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
                    Finish
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

              {showShortcutHint && !focusMode && (
                <p className="mt-5 flex items-center justify-center gap-1.5 text-center text-[11px] text-muted">
                  <LuKeyboard className="h-3.5 w-3.5" />
                  Shortcuts: A–E answer · ← → move · F flag · M focus
                  {!untimed && " · T timer"}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Navigator */}
        {!focusMode && (
          <div className="hidden lg:block">
            <div className="card sticky top-28 max-h-[calc(100vh-12rem)] overflow-y-auto p-4">
              <h3 className="section-label mb-3">Questions</h3>

              {navigatorGroups.map((group) => (
                <div key={group.key} className="mb-3">
                  {navigatorGroups.length > 1 && (
                    <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted">
                      {group.label}
                    </p>
                  )}
                  <div className="grid grid-cols-5 gap-1.5">
                    {group.questionIds.map((qid) => {
                      const i = indexById.get(qid);
                      if (i == null) return null;
                      const answer = answers[qid];
                      const current = i === currentIndex;
                      const answered = Boolean(answer?.selectedAnswer);
                      return (
                        <button
                          key={qid}
                          type="button"
                          onClick={() => goToQuestion(i)}
                          aria-label={`Question ${i + 1}${answered ? ", answered" : ", unanswered"}`}
                          aria-current={current ? "true" : undefined}
                          className={cn(
                            "relative h-8 w-8 rounded-lg text-xs font-semibold transition-all",
                            current
                              ? "bg-primary text-primary-foreground ring-2 ring-primary/30"
                              : answered
                                ? "bg-success-soft text-success hover:brightness-95"
                                : "bg-secondary text-muted hover:bg-border",
                          )}
                        >
                          {i + 1}
                          {answer?.flaggedForReview && (
                            <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-warning ring-2 ring-card" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}

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
                Submit
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Mobile bar — the app nav hides itself on exam routes, so this owns the bottom edge. */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-md lg:hidden">
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
            aria-pressed={focusMode}
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
            {answeredCount}/{questions.length}
          </div>

          <Button
            variant="outline"
            size="icon"
            onClick={() => goToQuestion(currentIndex + 1)}
            disabled={currentIndex >= questions.length - 1}
            aria-label="Next question"
          >
            <LuChevronRight className="h-5 w-5" />
          </Button>

          <Button
            variant="success"
            size="sm"
            onClick={() => setShowConfirmSubmit(true)}
          >
            Submit
          </Button>
        </div>
      </div>

      {showConfirmSubmit && (
        <ConfirmSubmitDialog
          title={confirmTitle}
          answeredCount={answeredCount}
          total={questions.length}
          unanswered={unanswered}
          flaggedCount={flaggedCount}
          submitting={submitting}
          extra={confirmExtra}
          onCancel={() => setShowConfirmSubmit(false)}
          onConfirm={handleSubmit}
        />
      )}

      <LeaveExamDialog
        open={pending !== null}
        untimed={untimed}
        onStay={cancelLeave}
        onLeave={confirmLeave}
      />
    </div>
  );
}

/**
 * Shown when a student clicks away mid-exam.
 *
 * Deliberately reassuring rather than accusing: leaving loses no answers, and
 * the only real cost — a timer that keeps running — is stated plainly instead
 * of threatened. Staying is the primary action; leaving stays one click away.
 */
function LeaveExamDialog({
  open,
  untimed,
  onStay,
  onLeave,
}: {
  open: boolean;
  untimed: boolean;
  onStay: () => void;
  onLeave: () => void;
}) {
  return (
    <Modal
      open={open}
      title="Leave this exam?"
      onClose={onStay}
      className="max-w-sm"
      footer={
        <div className="flex gap-3">
          <Button variant="outline" className="flex-1" onClick={onLeave}>
            Leave anyway
          </Button>
          <Button className="flex-1" onClick={onStay}>
            Stay in exam
          </Button>
        </div>
      }
    >
      <div className="space-y-2 text-sm leading-relaxed text-muted">
        <p>
          Your answers are saved. You can come back and pick up exactly where
          you left off.
        </p>
        {!untimed && (
          <p className="rounded-lg bg-warning-soft px-3 py-2 font-medium text-warning">
            The timer keeps running while you are away. If it runs out before
            you return, your exam is submitted with the answers you have so far.
          </p>
        )}
      </div>
    </Modal>
  );
}

function ConfirmSubmitDialog({
  title,
  answeredCount,
  total,
  unanswered,
  flaggedCount,
  submitting,
  extra,
  onCancel,
  onConfirm,
}: {
  title: string;
  answeredCount: number;
  total: number;
  unanswered: number;
  flaggedCount: number;
  submitting: boolean;
  extra?: ReactNode;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    confirmRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
        return;
      }
      if (event.key !== "Tab") return;

      const focusables = panelRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusables || focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-submit-title"
        className="w-full max-w-sm rounded-2xl bg-card p-6 shadow-lift animate-pop"
      >
        <h3
          id="confirm-submit-title"
          className="text-lg font-bold text-foreground"
        >
          {title}
        </h3>
        <div className="mt-3 space-y-2">
          <p className="text-sm text-muted">
            You answered{" "}
            <span className="font-bold text-foreground">{answeredCount}</span> of{" "}
            <span className="font-bold text-foreground">{total}</span> questions.
          </p>
          {unanswered > 0 && (
            <p className="rounded-lg bg-warning-soft px-3 py-2 text-sm font-medium text-warning">
              {unanswered} unanswered{" "}
              {unanswered === 1 ? "question is" : "questions are"} left blank.
            </p>
          )}
          {flaggedCount > 0 && (
            <p className="rounded-lg bg-accent-soft px-3 py-2 text-sm font-medium text-warning">
              {flaggedCount} flagged for review.
            </p>
          )}
          {extra}
        </div>
        <div className="mt-6 flex gap-3">
          <Button variant="outline" className="flex-1" onClick={onCancel}>
            Keep going
          </Button>
          <Button
            ref={confirmRef}
            variant="success"
            className="flex-1"
            disabled={submitting}
            onClick={onConfirm}
          >
            {submitting ? "Submitting…" : "Submit"}
          </Button>
        </div>
      </div>
    </div>
  );
}
