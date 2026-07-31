"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import {
  LuClock,
  LuChevronLeft,
  LuChevronRight,
  LuFlag,
  LuCheck,
  LuTriangleAlert,
} from "react-icons/lu";
import { Suspense } from "react";

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

function QuizEngine() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();

  const examType = searchParams.get("exam") || "";
  const examYear = searchParams.get("year") || "";
  const subjectSlug = params.subjectSlug as string;

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [showConfirmSubmit, setShowConfirmSubmit] = useState(false);

  // Quiz state
  const [assessmentId, setAssessmentId] = useState("");
  const [attemptId, setAttemptId] = useState("");
  const [title, setTitle] = useState("");
  const [questions, setQuestions] = useState<QuestionData[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, AnswerState>>({});
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [quizStarted, setQuizStarted] = useState(false);

  const questionStartTime = useRef(Date.now());

  // Generate quiz on mount
  useEffect(() => {
    async function generateQuiz() {
      setLoading(true);
      try {
        // First get subject ID from slug
        const subjectsRes = await fetch("/api/subjects");
        const subjectsData = await subjectsRes.json();
        const subject = (subjectsData.subjects || []).find(
          (s: { slug: string }) => s.slug === subjectSlug
        );

        if (!subject) {
          setError("Subject not found.");
          return;
        }

        const body: Record<string, unknown> = {
          subjectId: subject.id,
          count: 40,
        };
        if (examType) body.examType = examType;

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
        setAssessmentId(data.assessmentId);
        setAttemptId(data.attemptId);
        setTitle(data.title);
        setQuestions(data.questions);
        setTimeRemaining((data.timeLimitMinutes || 60) * 60);

        // Initialize answer states
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
  }, [subjectSlug, examType, examYear]);

  // Timer
  useEffect(() => {
    if (!quizStarted || timeRemaining <= 0) return;
    const interval = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          handleSubmit(); // Auto-submit when time runs out
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [quizStarted]);

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
        selectedAnswer: prev[questionId]?.selectedAnswer === answer ? null : answer,
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
        selectedAnswer: answers[q.id]?.selectedAnswer || null,
        timeSpentSeconds: answers[q.id]?.timeSpentSeconds || 0,
        flaggedForReview: answers[q.id]?.flaggedForReview || false,
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

      // Navigate to results page
      router.push(`/practice/results/${attemptId}`);
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
      return `${hrs}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    }
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }

  const answeredCount = Object.values(answers).filter(
    (a) => a.selectedAnswer !== null
  ).length;
  const flaggedCount = Object.values(answers).filter(
    (a) => a.flaggedForReview
  ).length;
  const currentQuestion = questions[currentIndex];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm text-muted">Preparing your quiz...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-md mx-auto py-20 text-center">
        <LuTriangleAlert className="w-12 h-12 text-amber-500 mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-foreground mb-2">
          Something went wrong
        </h2>
        <p className="text-sm text-muted mb-4">{error}</p>
        <button
          onClick={() => router.back()}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium"
        >
          Go Back
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="sticky top-0 bg-gray-50 z-10 pb-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-lg font-bold text-foreground">{title}</h1>
            <p className="text-xs text-muted">
              {examType && `${examType} ${examYear} · `}
              Question {currentIndex + 1} of {questions.length}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium ${
                timeRemaining < 300
                  ? "bg-red-100 text-red-700"
                  : "bg-blue-50 text-blue-700"
              }`}
            >
              <LuClock className="w-4 h-4" />
              {formatTime(timeRemaining)}
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="w-full bg-border rounded-full h-1.5">
          <div
            className="bg-primary h-1.5 rounded-full transition-all"
            style={{ width: `${(answeredCount / questions.length) * 100}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-muted mt-1">
          <span>{answeredCount} answered</span>
          {flaggedCount > 0 && (
            <span className="text-amber-600">{flaggedCount} flagged</span>
          )}
          <span>{questions.length - answeredCount} remaining</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_200px] gap-6">
        {/* Question area */}
        <div className="bg-card border border-border rounded-lg p-6">
          {currentQuestion && (
            <>
              {/* Question text */}
              <div className="mb-6">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <h2 className="text-base font-medium text-foreground leading-relaxed">
                    <span className="text-primary font-semibold mr-2">
                      Q{currentIndex + 1}.
                    </span>
                    {currentQuestion.questionText}
                  </h2>
                  <button
                    onClick={() => toggleFlag(currentQuestion.id)}
                    className={`flex-shrink-0 p-2 rounded-lg border transition-colors ${
                      answers[currentQuestion.id]?.flaggedForReview
                        ? "border-amber-300 bg-amber-50 text-amber-600"
                        : "border-border text-muted hover:bg-secondary"
                    }`}
                    title="Flag for review"
                  >
                    <LuFlag className="w-4 h-4" />
                  </button>
                </div>

                {currentQuestion.questionImageUrl && (
                  <div className="mb-4 rounded-lg overflow-hidden border border-border">
                    <img
                      src={currentQuestion.questionImageUrl}
                      alt="Question illustration"
                      className="max-w-full h-auto"
                    />
                  </div>
                )}
              </div>

              {/* Options */}
              {currentQuestion.options && (
                <div className="space-y-3">
                  {Object.entries(currentQuestion.options).map(([key, value]) => {
                    const isSelected =
                      answers[currentQuestion.id]?.selectedAnswer === key;
                    return (
                      <button
                        key={key}
                        onClick={() => selectAnswer(currentQuestion.id, key)}
                        className={`w-full flex items-start gap-3 p-4 rounded-lg border text-left transition-all ${
                          isSelected
                            ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                            : "border-border bg-card hover:border-primary/30 hover:bg-primary/5"
                        }`}
                      >
                        <span
                          className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${
                            isSelected
                              ? "bg-primary text-white"
                              : "bg-secondary text-foreground"
                          }`}
                        >
                          {key}
                        </span>
                        <span className="text-sm text-foreground pt-1">
                          {value as string}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Navigation */}
              <div className="flex items-center justify-between mt-8 pt-4 border-t border-border">
                <button
                  onClick={() => goToQuestion(currentIndex - 1)}
                  disabled={currentIndex === 0}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-muted hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <LuChevronLeft className="w-4 h-4" />
                  Previous
                </button>

                {currentIndex === questions.length - 1 ? (
                  <button
                    onClick={() => setShowConfirmSubmit(true)}
                    className="flex items-center gap-1.5 px-6 py-2.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
                  >
                    <LuCheck className="w-4 h-4" />
                    Finish Quiz
                  </button>
                ) : (
                  <button
                    onClick={() => goToQuestion(currentIndex + 1)}
                    className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-primary hover:text-primary/80 transition-colors"
                  >
                    Next
                    <LuChevronRight className="w-4 h-4" />
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        {/* Question navigator (sidebar) */}
        <div className="hidden lg:block">
          <div className="sticky top-28 bg-card border border-border rounded-lg p-4">
            <h3 className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">
              Questions
            </h3>
            <div className="grid grid-cols-5 gap-1.5">
              {questions.map((q, i) => {
                const answer = answers[q.id];
                const isCurrent = i === currentIndex;
                const isAnswered = answer?.selectedAnswer !== null;
                const isFlagged = answer?.flaggedForReview;

                return (
                  <button
                    key={q.id}
                    onClick={() => goToQuestion(i)}
                    className={`w-8 h-8 rounded text-xs font-medium transition-all relative ${
                      isCurrent
                        ? "bg-primary text-white ring-2 ring-primary/30"
                        : isAnswered
                          ? "bg-green-100 text-green-700 hover:bg-green-200"
                          : "bg-secondary text-muted hover:bg-border"
                    }`}
                  >
                    {i + 1}
                    {isFlagged && (
                      <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-amber-400 rounded-full" />
                    )}
                  </button>
                );
              })}
            </div>

            <div className="mt-4 pt-3 border-t border-border space-y-1.5">
              <div className="flex items-center gap-2 text-xs">
                <span className="w-3 h-3 rounded bg-green-100 border border-green-200" />
                <span className="text-muted">Answered ({answeredCount})</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="w-3 h-3 rounded bg-secondary border border-border" />
                <span className="text-muted">
                  Unanswered ({questions.length - answeredCount})
                </span>
              </div>
              {flaggedCount > 0 && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="w-3 h-3 rounded bg-amber-400" />
                  <span className="text-muted">Flagged ({flaggedCount})</span>
                </div>
              )}
            </div>

            <button
              onClick={() => setShowConfirmSubmit(true)}
              className="w-full mt-4 py-2 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700 transition-colors"
            >
              Submit Quiz
            </button>
          </div>
        </div>
      </div>

      {/* Mobile question navigator */}
      <div className="lg:hidden fixed bottom-16 left-0 right-0 bg-card border-t border-border p-3 z-40">
        <div className="flex items-center justify-between">
          <button
            onClick={() => goToQuestion(currentIndex - 1)}
            disabled={currentIndex === 0}
            className="p-2 rounded-lg border border-border disabled:opacity-30"
          >
            <LuChevronLeft className="w-5 h-5" />
          </button>
          <div className="text-center">
            <p className="text-xs text-muted">
              {answeredCount}/{questions.length} answered
            </p>
          </div>
          {currentIndex === questions.length - 1 ? (
            <button
              onClick={() => setShowConfirmSubmit(true)}
              className="px-4 py-2 bg-green-600 text-white rounded-lg text-xs font-medium"
            >
              Submit
            </button>
          ) : (
            <button
              onClick={() => goToQuestion(currentIndex + 1)}
              className="p-2 rounded-lg border border-border"
            >
              <LuChevronRight className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Confirm submit modal */}
      {showConfirmSubmit && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-card rounded-xl p-6 max-w-sm w-full">
            <h3 className="text-lg font-semibold text-foreground mb-2">
              Submit Quiz?
            </h3>
            <div className="space-y-2 mb-6">
              <p className="text-sm text-muted">
                You have answered{" "}
                <span className="font-medium text-foreground">
                  {answeredCount}
                </span>{" "}
                out of{" "}
                <span className="font-medium text-foreground">
                  {questions.length}
                </span>{" "}
                questions.
              </p>
              {questions.length - answeredCount > 0 && (
                <p className="text-sm text-amber-600">
                  {questions.length - answeredCount} questions are unanswered and
                  will be marked wrong.
                </p>
              )}
              {flaggedCount > 0 && (
                <p className="text-sm text-amber-600">
                  {flaggedCount} questions are flagged for review.
                </p>
              )}
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirmSubmit(false)}
                className="flex-1 py-2.5 rounded-lg border border-border text-sm font-medium hover:bg-secondary transition-colors"
              >
                Continue Quiz
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="flex-1 py-2.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-50"
              >
                {submitting ? "Submitting..." : "Submit"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function PastQuestionQuizPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <QuizEngine />
    </Suspense>
  );
}
