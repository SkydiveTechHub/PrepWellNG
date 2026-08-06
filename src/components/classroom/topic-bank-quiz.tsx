"use client";

import { Suspense } from "react";
import { QuizEngine } from "@/components/assessment/quiz-engine";
import { Spinner } from "@/components/ui/spinner";

// The quick quiz's fallback: five untimed questions drawn from the WAEC/JAMB
// bank for this topic. Used when the topic's lesson note carries no knowledge
// checks of its own, which is still most of the corpus.
//
// This is the page's previous behaviour, lifted verbatim into a component so
// the route can choose between it and the note's own questions.

export function TopicBankQuiz({
  subjectSlug,
  topicSlug,
  backHref,
}: {
  subjectSlug: string;
  topicSlug: string;
  backHref: string;
}) {
  return (
    <Suspense fallback={<Spinner label="Loading quiz..." />}>
      <QuizEngine
        subjectSlug={subjectSlug}
        topicSlug={topicSlug}
        count={5}
        untimed
        backHref={backHref}
      />
    </Suspense>
  );
}
