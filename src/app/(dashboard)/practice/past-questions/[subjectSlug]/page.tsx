"use client";

import { Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { QuizEngine } from "@/components/assessment/quiz-engine";
import { Spinner } from "@/components/ui/spinner";

function PastQuestionQuiz() {
  const params = useParams();
  const searchParams = useSearchParams();
  const subjectSlug = params.subjectSlug as string;
  const examType = searchParams.get("exam") || undefined;

  return (
    <QuizEngine
      subjectSlug={subjectSlug}
      examType={examType}
      count={40}
      backHref="/practice/past-questions"
    />
  );
}

export default function PastQuestionQuizPage() {
  return (
    <Suspense fallback={<Spinner label="Loading questions..." />}>
      <PastQuestionQuiz />
    </Suspense>
  );
}
