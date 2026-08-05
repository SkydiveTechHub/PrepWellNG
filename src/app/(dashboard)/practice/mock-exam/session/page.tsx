"use client";

import { Suspense, useCallback, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { ExamSurface } from "@/components/assessment/exam-surface";
import {
  useExamSession,
  type GeneratedExam,
} from "@/components/assessment/use-exam-session";
import type { ScopePoint } from "@/lib/curriculum-scope";

function MockExamSession() {
  const searchParams = useSearchParams();

  const examType = searchParams.get("examType") || "WAEC";
  const subjectId = searchParams.get("subjectId") || "";
  const count = Number(searchParams.get("count") || 40);

  const from = useMemo<ScopePoint>(
    () => ({
      classLevel: (searchParams.get("fromClass") || "SS1") as ScopePoint["classLevel"],
      term: (searchParams.get("fromTerm") || "FIRST") as ScopePoint["term"],
    }),
    [searchParams],
  );
  const to = useMemo<ScopePoint>(
    () => ({
      classLevel: (searchParams.get("toClass") || "SS1") as ScopePoint["classLevel"],
      term: (searchParams.get("toTerm") || "FIRST") as ScopePoint["term"],
    }),
    [searchParams],
  );

  // Distinct per configuration, so two different scopes never share a saved
  // session — resuming one into the other would show the wrong paper.
  const sessionKey = useMemo(
    () =>
      [
        "mock",
        examType,
        subjectId,
        from.classLevel,
        from.term,
        to.classLevel,
        to.term,
        count,
      ].join(":"),
    [examType, subjectId, from, to, count],
  );

  const generate = useCallback(async (): Promise<GeneratedExam> => {
    const res = await fetch("/api/assessments/mock-exam/scoped", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ examType, subjectId, from, to, count }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || "Couldn't build this mock exam.");
    }
    return res.json();
  }, [examType, subjectId, from, to, count]);

  const toResult = useCallback(
    (attemptId: string) => `/practice/results/${attemptId}`,
    [],
  );

  const session = useExamSession({
    sessionKey,
    generate,
    resultHref: toResult,
    defaultTimeLimitMinutes: Math.ceil(count * 1.5),
  });

  return (
    <ExamSurface
      session={session}
      eyebrow={examType}
      backHref="/practice/mock-exam"
      confirmTitle="Submit mock exam?"
    />
  );
}

export default function MockExamSessionPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary/25 border-t-primary" />
        </div>
      }
    >
      <MockExamSession />
    </Suspense>
  );
}
