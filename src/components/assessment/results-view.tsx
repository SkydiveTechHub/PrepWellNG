"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  LuCheck,
  LuX,
  LuClock,
  LuTarget,
  LuTrophy,
  LuChevronDown,
  LuChevronUp,
  LuArrowLeft,
  LuRotateCcw,
  LuSparkles,
} from "react-icons/lu";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { QuestionImage } from "@/components/ui/question-image";

type QuestionResult = {
  questionId: string;
  questionText: string;
  questionImageUrl: string | null;
  options: Record<string, string> | null;
  selectedAnswer: string | null;
  correctAnswer: string;
  isCorrect: boolean;
  explanation: string;
  explanationImageUrl: string | null;
  topic: string | null;
  difficulty: string;
  timeSpentSeconds: number;
};

type TopicBreakdown = {
  topicId: string;
  topicTitle: string;
  correct: number;
  total: number;
  accuracy: number;
  status: string;
};

type ResultData = {
  attemptId: string;
  assessmentTitle: string;
  assessmentType: string;
  examYear?: number | null;
  /** Present only for JAMB CBT papers, which are marked out of 400. */
  jamb?: {
    perSubject: {
      subjectId: string;
      subjectCode: string;
      subjectName: string;
      correct: number;
      total: number;
      marks: number;
    }[];
    score: number;
    totalMarks: number;
    percentage: number;
    band: { label: string; remark: string };
  } | null;
  score: number;
  totalMarks: number;
  percentage: number;
  grade: string;
  gradeRemark: string;
  isCredit: boolean;
  timeSpentSeconds: number;
  totalQuestions: number;
  correctCount: number;
  results: QuestionResult[];
  topicBreakdown: TopicBreakdown[];
};

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

function encouragement(percentage: number) {
  if (percentage >= 70)
    return {
      title: "Outstanding work!",
      message:
        "You're in strong shape here. Keep this momentum going and you'll walk into the exam with confidence.",
    };
  if (percentage >= 50)
    return {
      title: "Solid progress",
      message:
        "Good effort. Review the explanations below — turning a few weak spots into strengths is all it takes.",
    };
  return {
    title: "Great attempt",
    message:
      "Every attempt builds exam muscle. Read each explanation carefully, then try again — you will improve.",
  };
}

function topicBadge(status: string) {
  switch (status) {
    case "strong":
      return <Badge variant="green">Strong</Badge>;
    case "competent":
      return <Badge variant="blue">Competent</Badge>;
    case "developing":
      return <Badge variant="amber">Developing</Badge>;
    default:
      return <Badge variant="red">Needs work</Badge>;
  }
}

/**
 * Interactive half of the results screen. The data arrives already resolved
 * from the server component, so there is no spinner, no client fetch, and the
 * score is in the initial HTML.
 */
export function ResultsView({ result }: { result: ResultData }) {
  const router = useRouter();

  const [expandedQuestions, setExpandedQuestions] = useState<Set<string>>(
    new Set(),
  );
  const [showAllQuestions, setShowAllQuestions] = useState(false);
  const [filterMode, setFilterMode] = useState<"all" | "correct" | "wrong">(
    "all",
  );

  function toggleQuestion(questionId: string) {
    setExpandedQuestions((prev) => {
      const next = new Set(prev);
      if (next.has(questionId)) {
        next.delete(questionId);
      } else {
        next.add(questionId);
      }
      return next;
    });
  }

  const filteredResults = result.results.filter((r) => {
    if (filterMode === "correct") return r.isCorrect;
    if (filterMode === "wrong") return !r.isCorrect;
    return true;
  });

  const displayedResults = showAllQuestions
    ? filteredResults
    : filteredResults.slice(0, 10);

  const cheer = encouragement(result.percentage);

  return (
    <div className="mx-auto max-w-3xl space-y-6 animate-fade-in">
      <button
        type="button"
        onClick={() => router.push("/practice/past-questions")}
        className="flex items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-foreground"
      >
        <LuArrowLeft className="h-4 w-4" />
        Back to Past Questions
      </button>

      {/* Score hero */}
      <div
        className={cn(
          "relative overflow-hidden card p-6 md:p-8",
          result.isCredit ? "ring-1 ring-success/20" : "ring-1 ring-warning/20",
        )}
      >
        <div
          className={cn(
            "absolute -right-10 -top-10 h-40 w-40 rounded-full opacity-10",
            result.isCredit ? "bg-success" : "bg-warning",
          )}
        />
        <div className="relative">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold tracking-tight text-foreground md:text-2xl">
                {result.assessmentTitle}
              </h1>
              <p className="mt-0.5 text-sm text-muted">
                {result.jamb ? result.jamb.band.remark : "Quiz completed"}
              </p>
            </div>
            <div className="text-right">
              {/* A UTME candidate reads a mark out of 400, not a percentage. */}
              <p
                className={cn(
                  "text-4xl font-bold tracking-tight md:text-5xl",
                  result.isCredit ? "text-success" : "text-warning",
                )}
              >
                {result.jamb ? result.jamb.score : `${result.percentage}%`}
              </p>
              <p className="mt-0.5 text-xs font-medium text-muted">
                {result.jamb
                  ? `out of ${result.jamb.totalMarks} · ${result.jamb.band.label}`
                  : `${result.score}/${result.totalMarks} marks`}
              </p>
            </div>
          </div>

          {/* Encouragement */}
          <div className="mt-5 flex items-start gap-3 rounded-xl bg-secondary/60 p-4">
            <div
              className={cn(
                "mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg",
                result.isCredit ? "bg-success-soft text-success" : "bg-warning-soft text-warning",
              )}
            >
              <LuSparkles className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-foreground">{cheer.title}</p>
              <p className="mt-0.5 text-sm leading-relaxed text-muted">
                {cheer.message}
              </p>
            </div>
          </div>

          {/* Metrics */}
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-border bg-card p-3 text-center">
              <div className="flex items-center justify-center gap-1.5">
                <LuTrophy
                  className={cn(
                    "h-4 w-4",
                    result.isCredit ? "text-success" : "text-warning",
                  )}
                />
                <span className="text-2xl font-bold text-foreground">
                  {result.grade}
                </span>
              </div>
              <p className="mt-0.5 text-[11px] font-medium text-muted">
                {result.gradeRemark}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-card p-3 text-center">
              <div className="flex items-center justify-center gap-1.5">
                <LuTarget className="h-4 w-4 text-primary" />
                <span className="text-2xl font-bold text-foreground">
                  {result.correctCount}
                </span>
              </div>
              <p className="mt-0.5 text-[11px] font-medium text-muted">
                of {result.totalQuestions} correct
              </p>
            </div>
            <div className="rounded-xl border border-border bg-card p-3 text-center">
              <div className="flex items-center justify-center gap-1.5">
                <LuClock className="h-4 w-4 text-blue-500" />
                <span className="text-xl font-bold text-foreground">
                  {formatDuration(result.timeSpentSeconds)}
                </span>
              </div>
              <p className="mt-0.5 text-[11px] font-medium text-muted">
                total time
              </p>
            </div>
            <div className="rounded-xl border border-border bg-card p-3 text-center">
              <p className="text-2xl font-bold text-foreground">
                {result.percentage}%
              </p>
              <p className="mt-0.5 text-[11px] font-medium text-muted">
                accuracy
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/practice/past-questions"
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground shadow-soft transition-colors hover:bg-primary-hover sm:flex-none"
            >
              <LuRotateCcw className="h-4 w-4" />
              Practice Again
            </Link>
            <Link
              href="/performance"
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-bold text-foreground transition-colors hover:border-primary/40 hover:bg-primary-soft sm:flex-none"
            >
              View performance
            </Link>
          </div>
        </div>
      </div>

      {/* Subject breakdown — the view a UTME candidate actually reads. */}
      {result.jamb && result.jamb.perSubject.length > 0 && (
        <div className="card p-6">
          <h2 className="text-lg font-bold text-foreground">
            Score by subject
          </h2>
          <p className="mt-0.5 text-sm text-muted">
            Each subject is marked out of 100, whatever its question count.
          </p>

          <div className="mt-5 space-y-4">
            {result.jamb.perSubject.map((subject) => (
              <div key={subject.subjectId}>
                <div className="mb-1.5 flex items-baseline justify-between gap-3">
                  <span className="text-sm font-semibold text-foreground">
                    {subject.subjectName}
                  </span>
                  <span className="text-sm text-muted">
                    <span className="font-bold text-foreground">
                      {subject.marks}
                    </span>
                    /100
                    <span className="ml-2 text-xs">
                      ({subject.correct}/{subject.total} correct)
                    </span>
                  </span>
                </div>
                <Progress value={subject.marks} tone="auto" className="h-2" />
              </div>
            ))}
          </div>

          <div className="mt-5 flex items-baseline justify-between border-t border-border pt-4">
            <span className="text-sm font-bold text-foreground">Total</span>
            <span className="text-lg font-bold text-foreground">
              {result.jamb.score}
              <span className="ml-1 text-sm font-semibold text-muted">
                / {result.jamb.totalMarks}
              </span>
            </span>
          </div>
        </div>
      )}

      {/* Topic breakdown */}
      {result.topicBreakdown.length > 0 && (
        <div className="card p-6">
          <h2 className="text-lg font-bold text-foreground">
            Performance by Topic
          </h2>
          <div className="mt-5 space-y-4">
            {result.topicBreakdown.map((topic) => (
              <div key={topic.topicId}>
                <div className="mb-1.5 flex items-center justify-between gap-3">
                  <span className="truncate text-sm font-semibold text-foreground">
                    {topic.topicTitle || "General"}
                  </span>
                  <div className="flex flex-shrink-0 items-center gap-2">
                    <span className="text-xs text-muted">
                      {topic.correct}/{topic.total}
                    </span>
                    {topicBadge(topic.status)}
                  </div>
                </div>
                <Progress value={topic.accuracy} className="h-2" tone="auto" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Question review */}
      <div className="card p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-foreground">Question Review</h2>
          <div className="flex gap-1 rounded-lg bg-secondary p-0.5">
            {(["all", "correct", "wrong"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setFilterMode(mode)}
                className={cn(
                  "rounded-md px-3 py-1 text-xs font-semibold transition-colors",
                  filterMode === mode
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted hover:text-foreground",
                )}
              >
                {mode === "all"
                  ? `All (${result.results.length})`
                  : mode === "correct"
                    ? `Correct (${result.correctCount})`
                    : `Wrong (${result.totalQuestions - result.correctCount})`}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          {displayedResults.map((q) => {
            const isExpanded = expandedQuestions.has(q.questionId);
            const questionIndex = result.results.indexOf(q);

            return (
              <div
                key={q.questionId}
                className={cn(
                  "overflow-hidden rounded-xl border transition-colors",
                  q.isCorrect
                    ? "border-success/25"
                    : "border-danger/25",
                )}
              >
                <button
                  type="button"
                  onClick={() => toggleQuestion(q.questionId)}
                  aria-expanded={isExpanded}
                  className="flex w-full items-start gap-3 p-4 text-left transition-colors hover:bg-secondary/40"
                >
                  <span
                    className={cn(
                      "mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full",
                      q.isCorrect
                        ? "bg-success-soft text-success"
                        : "bg-danger-soft text-danger",
                    )}
                  >
                    {q.isCorrect ? (
                      <LuCheck className="h-3.5 w-3.5" />
                    ) : (
                      <LuX className="h-3.5 w-3.5" />
                    )}
                  </span>
                  <span className="flex-1 min-w-0 text-sm text-foreground line-clamp-2">
                    <span className="mr-1 font-bold text-muted">
                      Q{questionIndex + 1}.
                    </span>
                    {q.questionText}
                  </span>
                  {isExpanded ? (
                    <LuChevronUp className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted" />
                  ) : (
                    <LuChevronDown className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted" />
                  )}
                </button>

                {isExpanded && (
                  <div className="border-t border-border/50 px-4 pb-4 animate-fade-in">
                    {q.options && (
                      <div className="mt-3 space-y-2">
                        {Object.entries(q.options).map(([key, value]) => {
                          const isCorrectAnswer = key === q.correctAnswer;
                          const isSelected = key === q.selectedAnswer;
                          return (
                            <div
                              key={key}
                              className={cn(
                                "flex items-start gap-2.5 rounded-lg border p-3 text-sm",
                                isCorrectAnswer
                                  ? "border-success/30 bg-success-soft"
                                  : isSelected && !isCorrectAnswer
                                    ? "border-danger/30 bg-danger-soft"
                                    : "bg-secondary/50",
                              )}
                            >
                              <span
                                className={cn(
                                  "flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold",
                                  isCorrectAnswer
                                    ? "bg-success text-white"
                                    : isSelected
                                      ? "bg-danger text-white"
                                      : "bg-border text-muted",
                                )}
                              >
                                {key}
                              </span>
                              <span className="flex-1 text-foreground">
                                {value as string}
                              </span>
                              {isCorrectAnswer && (
                                <LuCheck className="mt-0.5 h-4 w-4 flex-shrink-0 text-success" />
                              )}
                              {isSelected && !isCorrectAnswer && (
                                <LuX className="mt-0.5 h-4 w-4 flex-shrink-0 text-danger" />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <div className="mt-4 rounded-xl border border-tone-blue-line bg-tone-blue-soft p-4">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-tone-blue-ink">
                        Explanation
                      </h4>
                      <p className="mt-2 text-sm leading-relaxed text-tone-blue-ink">
                        {q.explanation}
                      </p>
                      {q.explanationImageUrl && (
                        <QuestionImage
                          src={q.explanationImageUrl}
                          alt="Diagram supporting this explanation"
                          className="mt-3"
                        />
                      )}
                    </div>

                    <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted">
                      <span>
                        Your answer:{" "}
                        <span className="font-bold text-foreground">
                          {q.selectedAnswer || "Skipped"}
                        </span>
                      </span>
                      <span>
                        Correct:{" "}
                        <span className="font-bold text-success">
                          {q.correctAnswer}
                        </span>
                      </span>
                      <span>Time: {formatDuration(q.timeSpentSeconds)}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {filteredResults.length > 10 && (
          <button
            type="button"
            onClick={() => setShowAllQuestions(!showAllQuestions)}
            className="mt-4 w-full py-2.5 text-sm font-bold text-primary transition-colors hover:text-primary-hover"
          >
            {showAllQuestions
              ? "Show fewer questions"
              : `Show all ${filteredResults.length} questions`}
          </button>
        )}
      </div>
    </div>
  );
}
