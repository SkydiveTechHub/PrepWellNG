"use client";

import { useState } from "react";
import Link from "next/link";
import { LuArrowLeft, LuCircleCheck } from "react-icons/lu";
import { KnowledgeCheck } from "@/components/lesson/knowledge-check";
import { buttonClass } from "@/components/ui/button";
import type { CheckBlock } from "@/lib/lesson-engine";

// The lesson note's OWN questions, as a standalone quiz.
//
// Before this existed, `/quiz` served questions from the WAEC/JAMB bank -- the
// same source as `/practice`, differing only in count and timing -- so the quiz
// a teacher wrote into their note was never shown as a quiz. It appeared only
// inline in the step-by-step player, at each check's `afterCard` position.
//
// Deliberately low-stakes: no timer, no attempt row, nothing written to the
// database. It is a self-check over the material just read. `/practice` remains
// the graded, timed, bank-backed exam.

type Result = { correct: boolean; attempts: number };

export function LessonQuickQuiz({
  checks,
  lessonTitle,
  backHref,
}: {
  checks: CheckBlock[];
  lessonTitle: string;
  backHref: string;
}) {
  const [results, setResults] = useState<Record<string, Result>>({});

  const answered = Object.keys(results).length;
  const done = answered === checks.length;
  // KnowledgeCheck only settles once the student picks the right option, so
  // every question ends correct. What actually distinguishes them is whether
  // it took more than one go -- that is the number worth reporting.
  const firstTime = Object.values(results).filter((r) => r.attempts === 1).length;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-foreground"
        >
          <LuArrowLeft className="h-4 w-4" />
          Back to {lessonTitle}
        </Link>
        <h1 className="mt-3 text-2xl font-bold tracking-tight text-foreground">
          Quick quiz
        </h1>
        <p className="mt-1 text-sm text-muted">
          {checks.length} question{checks.length === 1 ? "" : "s"} from this lesson
          note. Untimed, and nothing is recorded — answer at your own pace.
        </p>
      </div>

      <div className="space-y-4">
        {checks.map((block, index) => (
          <div key={block.id} className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
              Question {index + 1} of {checks.length}
            </p>
            <KnowledgeCheck
              block={block}
              onResult={(attempts, correct) =>
                setResults((prev) =>
                  // A question settles once. Keep the first recorded result so
                  // a re-render can never inflate the tally.
                  prev[block.id] ? prev : { ...prev, [block.id]: { correct, attempts } },
                )
              }
            />
          </div>
        ))}
      </div>

      {done && (
        <div className="rounded-2xl border border-border-strong bg-card p-5">
          <div className="flex items-center gap-2.5">
            <LuCircleCheck className="h-5 w-5 flex-shrink-0 text-primary" />
            <p className="text-base font-semibold text-foreground">
              {firstTime} of {checks.length} right first time
            </p>
          </div>
          <p className="mt-2 text-sm text-muted">
            {firstTime === checks.length
              ? "Every question first time — you know this one. Try the practice test for exam-style questions."
              : "Re-read the cards for anything that took more than one go, then try the practice test."}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href={backHref} className={buttonClass("outline", "md")}>
              Back to the lesson
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
