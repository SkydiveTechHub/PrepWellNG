"use client";

import Link from "next/link";
import {
  LuArrowLeft,
  LuClock,
  LuTarget,
  LuTimer,
  LuTrophy,
} from "react-icons/lu";
import { Badge } from "@/components/ui/badge";
import { QuizEngine } from "@/components/assessment/quiz-engine";

type PracticeExitProps = {
  subjectSlug: string;
  topicSlug: string;
  lessonTitle: string;
  topicTitle: string;
  passMarkPercent: number;
  practiceCount: number;
  backHref: string;
};

export function PracticeExit(props: PracticeExitProps) {
  const totalSeconds = props.practiceCount * 90;
  const totalMinutes = Math.ceil(totalSeconds / 60);
  const resultHref = (attemptId: string) =>
    `/classroom/${props.subjectSlug}/${props.topicSlug}/practice/result?attemptId=${attemptId}`;

  return (
    <div className="space-y-6 animate-fade-in">
      <Link
        href={props.backHref}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-foreground"
      >
        <LuArrowLeft className="h-4 w-4" />
        Back to lesson
      </Link>

      <div className="card p-6 md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wider text-primary">
              Practice exit · {props.topicTitle}
            </p>
            <h1 className="mt-1 text-xl font-bold leading-tight tracking-tight text-foreground md:text-2xl">
              Prove you&apos;ve mastered {props.lessonTitle}
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
              This timed test is the gate that completes the lesson. Reach the
              pass mark and the lesson is yours; miss it and you&apos;ll be sent
              back to the cards that tripped you up.
            </p>
          </div>
          <Badge variant="blue" className="text-sm">
            <LuTrophy className="h-3.5 w-3.5" />
            Pass {props.passMarkPercent}%
          </Badge>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="flex items-center gap-3 rounded-xl border border-border bg-secondary/40 p-4">
            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
              <LuTarget className="h-5 w-5" />
            </span>
            <div>
              <p className="text-lg font-bold text-foreground">
                {props.practiceCount}
              </p>
              <p className="text-xs font-medium text-muted">questions</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-border bg-secondary/40 p-4">
            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
              <LuTimer className="h-5 w-5" />
            </span>
            <div>
              <p className="text-lg font-bold text-foreground">90s each</p>
              <p className="text-xs font-medium text-muted">
                JAMB-style timing · ~{totalMinutes}min total
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-border bg-secondary/40 p-4">
            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
              <LuClock className="h-5 w-5" />
            </span>
            <div>
              <p className="text-lg font-bold text-foreground">Untimed→Timed</p>
              <p className="text-xs font-medium text-muted">
                checks were practice; this is the exam
              </p>
            </div>
          </div>
        </div>
      </div>

      <QuizEngine
        subjectSlug={props.subjectSlug}
        topicSlug={props.topicSlug}
        examType="JAMB"
        count={props.practiceCount}
        title={`${props.lessonTitle} — Practice Exit`}
        resultHref={resultHref}
        backHref={props.backHref}
      />
    </div>
  );
}
