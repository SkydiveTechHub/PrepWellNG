"use client";

import { useCallback, useMemo } from "react";
import { ExamSurface } from "./exam-surface";
import { useExamSession, type GeneratedExam } from "./use-exam-session";

type QuizEngineProps = {
  subjectSlug: string;
  topicSlug?: string;
  examType?: string;
  count?: number;
  backHref?: string;
  title?: string;
  resultHref?: (attemptId: string) => string;
};

/**
 * Single-subject quiz: topic quizzes, past-question sets and lesson practice
 * exits. The session mechanics live in `useExamSession`, shared with the
 * multi-subject mock exam.
 */
export function QuizEngine({
  subjectSlug,
  topicSlug,
  examType = "",
  count = 10,
  backHref,
  title: titleOverride,
  resultHref,
}: QuizEngineProps) {
  const sessionKey = useMemo(
    () =>
      ["quiz", subjectSlug, topicSlug ?? "-", examType || "-", count].join(":"),
    [subjectSlug, topicSlug, examType, count],
  );

  const generate = useCallback(async (): Promise<GeneratedExam> => {
    const res = await fetch("/api/assessments/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subjectSlug,
        ...(topicSlug ? { topicSlug } : {}),
        ...(examType ? { examType } : {}),
        ...(titleOverride ? { title: titleOverride } : {}),
        count,
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Failed to generate quiz.");
    }
    return res.json();
  }, [subjectSlug, topicSlug, examType, count, titleOverride]);

  const toResult = useCallback(
    (attemptId: string) =>
      resultHref ? resultHref(attemptId) : `/practice/results/${attemptId}`,
    [resultHref],
  );

  const session = useExamSession({
    sessionKey,
    generate,
    resultHref: toResult,
  });

  return (
    <ExamSurface
      session={session}
      eyebrow={examType || undefined}
      backHref={backHref}
      confirmTitle="Submit Quiz?"
    />
  );
}
