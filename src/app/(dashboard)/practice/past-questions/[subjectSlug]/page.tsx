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
  // The picker has always sent ?year=, but this page used to drop it, so
  // "2022 JAMB Chemistry" generated from every JAMB Chemistry year we hold.
  const yearParam = Number(searchParams.get("year"));
  const examYear = Number.isInteger(yearParam) && yearParam > 0 ? yearParam : undefined;

  return (
    <QuizEngine
      subjectSlug={subjectSlug}
      examType={examType}
      examYear={examYear}
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
