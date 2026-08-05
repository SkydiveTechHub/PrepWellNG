"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import { QuizEngine } from "@/components/assessment/quiz-engine";
import { Spinner } from "@/components/ui/spinner";

function TopicQuiz() {
  const params = useParams();
  const subjectSlug = params.subjectSlug as string;
  const topicSlug = params.topicSlug as string;

  return (
    <QuizEngine
      subjectSlug={subjectSlug}
      topicSlug={topicSlug}
      count={5}
      untimed
      backHref={`/classroom/${subjectSlug}/${topicSlug}`}
    />
  );
}

export default function TopicQuizPage() {
  return (
    <Suspense fallback={<Spinner label="Loading quiz..." />}>
      <TopicQuiz />
    </Suspense>
  );
}
