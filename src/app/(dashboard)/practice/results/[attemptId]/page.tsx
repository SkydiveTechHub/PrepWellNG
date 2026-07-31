"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
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
} from "react-icons/lu";

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

export default function ResultsPage() {
  const params = useParams();
  const router = useRouter();
  const attemptId = params.attemptId as string;

  const [result, setResult] = useState<ResultData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedQuestions, setExpandedQuestions] = useState<Set<string>>(
    new Set()
  );
  const [showAllQuestions, setShowAllQuestions] = useState(false);
  const [filterMode, setFilterMode] = useState<"all" | "correct" | "wrong">(
    "all"
  );

  useEffect(() => {
    // Result data is passed via sessionStorage from the submit response
    // or fetched from API
    const stored = sessionStorage.getItem(`result-${attemptId}`);
    if (stored) {
      setResult(JSON.parse(stored));
      setLoading(false);
      return;
    }

    // Fetch from API (for page refreshes or direct navigation)
    async function fetchResult() {
      try {
        const res = await fetch(`/api/assessments/attempts/${attemptId}`);
        if (res.ok) {
          const data = await res.json();
          setResult(data);
        }
      } catch {
        // Result not available
      } finally {
        setLoading(false);
      }
    }
    fetchResult();
  }, [attemptId]);

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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!result) {
    return (
      <div className="max-w-md mx-auto py-20 text-center">
        <h2 className="text-lg font-semibold text-foreground mb-2">
          Result not found
        </h2>
        <p className="text-sm text-muted mb-4">
          This result may have expired. Try taking another quiz.
        </p>
        <Link
          href="/practice/past-questions"
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium"
        >
          Back to Past Questions
        </Link>
      </div>
    );
  }

  const filteredResults = result.results.filter((r) => {
    if (filterMode === "correct") return r.isCorrect;
    if (filterMode === "wrong") return !r.isCorrect;
    return true;
  });

  const displayedResults = showAllQuestions
    ? filteredResults
    : filteredResults.slice(0, 10);

  return (
    <div className="max-w-3xl mx-auto">
      {/* Back button */}
      <button
        onClick={() => router.push("/practice/past-questions")}
        className="flex items-center gap-1.5 text-sm text-muted hover:text-foreground mb-4 transition-colors"
      >
        <LuArrowLeft className="w-4 h-4" />
        Back to Past Questions
      </button>

      {/* Score card */}
      <div className="bg-card border border-border rounded-xl p-6 mb-6">
        <h1 className="text-xl font-bold text-foreground mb-1">
          {result.assessmentTitle}
        </h1>
        <p className="text-sm text-muted mb-6">Quiz completed</p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          {/* Score */}
          <div className="text-center">
            <div
              className={`text-3xl font-bold ${
                result.isCredit ? "text-green-600" : "text-amber-600"
              }`}
            >
              {result.percentage}%
            </div>
            <p className="text-xs text-muted mt-1">
              {result.score}/{result.totalMarks} marks
            </p>
          </div>

          {/* Grade */}
          <div className="text-center">
            <div className="flex items-center justify-center gap-1.5">
              <LuTrophy
                className={`w-5 h-5 ${
                  result.isCredit ? "text-green-600" : "text-amber-600"
                }`}
              />
              <span className="text-3xl font-bold text-foreground">
                {result.grade}
              </span>
            </div>
            <p className="text-xs text-muted mt-1">{result.gradeRemark}</p>
          </div>

          {/* Accuracy */}
          <div className="text-center">
            <div className="flex items-center justify-center gap-1.5">
              <LuTarget className="w-5 h-5 text-primary" />
              <span className="text-3xl font-bold text-foreground">
                {result.correctCount}
              </span>
            </div>
            <p className="text-xs text-muted mt-1">
              of {result.totalQuestions} correct
            </p>
          </div>

          {/* Time */}
          <div className="text-center">
            <div className="flex items-center justify-center gap-1.5">
              <LuClock className="w-5 h-5 text-blue-500" />
              <span className="text-xl font-bold text-foreground">
                {formatDuration(result.timeSpentSeconds)}
              </span>
            </div>
            <p className="text-xs text-muted mt-1">total time</p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <Link
            href="/practice/past-questions"
            className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <LuRotateCcw className="w-4 h-4" />
            Practice Again
          </Link>
        </div>
      </div>

      {/* Topic Breakdown */}
      {result.topicBreakdown.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-6 mb-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">
            Performance by Topic
          </h2>
          <div className="space-y-3">
            {result.topicBreakdown.map((topic) => (
              <div key={topic.topicId}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-medium text-foreground">
                    {topic.topicTitle || "General"}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted">
                      {topic.correct}/{topic.total}
                    </span>
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        topic.status === "strong"
                          ? "bg-green-100 text-green-700"
                          : topic.status === "competent"
                            ? "bg-blue-100 text-blue-700"
                            : topic.status === "developing"
                              ? "bg-amber-100 text-amber-700"
                              : "bg-red-100 text-red-700"
                      }`}
                    >
                      {topic.status}
                    </span>
                  </div>
                </div>
                <div className="w-full bg-border rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all ${
                      topic.accuracy >= 80
                        ? "bg-green-500"
                        : topic.accuracy >= 60
                          ? "bg-blue-500"
                          : topic.accuracy >= 40
                            ? "bg-amber-500"
                            : "bg-red-500"
                    }`}
                    style={{ width: `${topic.accuracy}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Question Review */}
      <div className="bg-card border border-border rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">
            Question Review
          </h2>
          <div className="flex gap-1 bg-secondary rounded-lg p-0.5">
            {(["all", "correct", "wrong"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setFilterMode(mode)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  filterMode === mode
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted hover:text-foreground"
                }`}
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
          {displayedResults.map((q, i) => {
            const isExpanded = expandedQuestions.has(q.questionId);
            const questionIndex = result.results.indexOf(q);

            return (
              <div
                key={q.questionId}
                className={`border rounded-lg overflow-hidden ${
                  q.isCorrect ? "border-green-200" : "border-red-200"
                }`}
              >
                {/* Question header */}
                <button
                  onClick={() => toggleQuestion(q.questionId)}
                  className="w-full flex items-start gap-3 p-4 text-left hover:bg-secondary/50 transition-colors"
                >
                  <span
                    className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${
                      q.isCorrect
                        ? "bg-green-100 text-green-600"
                        : "bg-red-100 text-red-600"
                    }`}
                  >
                    {q.isCorrect ? (
                      <LuCheck className="w-3.5 h-3.5" />
                    ) : (
                      <LuX className="w-3.5 h-3.5" />
                    )}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground line-clamp-2">
                      <span className="font-medium text-muted mr-1">
                        Q{questionIndex + 1}.
                      </span>
                      {q.questionText}
                    </p>
                  </div>
                  {isExpanded ? (
                    <LuChevronUp className="w-4 h-4 text-muted flex-shrink-0 mt-0.5" />
                  ) : (
                    <LuChevronDown className="w-4 h-4 text-muted flex-shrink-0 mt-0.5" />
                  )}
                </button>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-border/50">
                    {/* Options review */}
                    {q.options && (
                      <div className="mt-3 space-y-2">
                        {Object.entries(q.options).map(([key, value]) => {
                          const isCorrectAnswer = key === q.correctAnswer;
                          const isSelected = key === q.selectedAnswer;

                          return (
                            <div
                              key={key}
                              className={`flex items-start gap-2.5 p-3 rounded-lg text-sm ${
                                isCorrectAnswer
                                  ? "bg-green-50 border border-green-200"
                                  : isSelected && !isCorrectAnswer
                                    ? "bg-red-50 border border-red-200"
                                    : "bg-secondary/50"
                              }`}
                            >
                              <span
                                className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                                  isCorrectAnswer
                                    ? "bg-green-200 text-green-700"
                                    : isSelected
                                      ? "bg-red-200 text-red-700"
                                      : "bg-border text-muted"
                                }`}
                              >
                                {key}
                              </span>
                              <span className="text-foreground">
                                {value as string}
                              </span>
                              {isCorrectAnswer && (
                                <LuCheck className="w-4 h-4 text-green-600 ml-auto flex-shrink-0" />
                              )}
                              {isSelected && !isCorrectAnswer && (
                                <LuX className="w-4 h-4 text-red-600 ml-auto flex-shrink-0" />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Explanation */}
                    <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                      <h4 className="text-xs font-semibold text-blue-800 uppercase tracking-wider mb-2">
                        Explanation
                      </h4>
                      <p className="text-sm text-blue-900 leading-relaxed">
                        {q.explanation}
                      </p>
                      {q.explanationImageUrl && (
                        <img
                          src={q.explanationImageUrl}
                          alt="Explanation illustration"
                          className="mt-3 rounded-lg max-w-full"
                        />
                      )}
                    </div>

                    {/* Meta */}
                    <div className="flex gap-4 mt-3 text-xs text-muted">
                      <span>
                        Your answer:{" "}
                        <span className="font-medium text-foreground">
                          {q.selectedAnswer || "Skipped"}
                        </span>
                      </span>
                      <span>
                        Correct:{" "}
                        <span className="font-medium text-green-600">
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

        {/* Show more / less */}
        {filteredResults.length > 10 && (
          <button
            onClick={() => setShowAllQuestions(!showAllQuestions)}
            className="w-full mt-4 py-2.5 text-sm font-medium text-primary hover:text-primary/80 transition-colors"
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
