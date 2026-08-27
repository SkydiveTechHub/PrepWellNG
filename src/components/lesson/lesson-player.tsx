"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  LuArrowRight,
  LuBookOpen,
  LuCheck,
  LuChevronLeft,
  LuClock,
  LuLock,
  LuPartyPopper,
  LuPlay,
} from "react-icons/lu";
import { Button, buttonClass } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Markdown } from "./markdown";
import { ObjectivesPanel } from "./objectives-panel";
import { MicroCard } from "./micro-card";
import type { LessonBlock } from "@/lib/lesson-engine";

type LegacyData = {
  content: string;
  keyPoints: string[];
  summary: string | null;
};

type LessonPlayerProps = {
  lessonTitle: string;
  blocks: LessonBlock[];
  objectives: string[];
  durationMinutes: number;
  difficulty: string;
  prerequisiteLabels: string[];
  locked: boolean;
  lockedReason?: string | null;
  legacy?: LegacyData;
  backHref: string;
  quizHref: string;
  lessonId: string;
  subjectSlug: string;
  topicSlug: string;
  passMarkPercent: number;
  practiceCount: number;
  /** Cards already worked through, so a return visit resumes where it stopped. */
  checkpoint?: {
    visited: string[];
    checks: Record<string, CheckResult>;
  };
};

const DIFFICULTY_BADGE: Record<string, "green" | "amber" | "red"> = {
  BASIC: "green",
  INTERMEDIATE: "amber",
  ADVANCED: "red",
};

type CheckResult = { attempts: number; correct: boolean };

export function LessonPlayer(props: LessonPlayerProps) {
  if (props.blocks.length === 0) {
    return <LegacyLesson {...props} />;
  }
  return <BlockLesson {...props} />;
}

function LessonMeta({ props }: { props: LessonPlayerProps }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant={DIFFICULTY_BADGE[props.difficulty] ?? "neutral"}>
        {props.difficulty === "BASIC"
          ? "Basic"
          : props.difficulty === "ADVANCED"
            ? "Advanced"
            : "Intermediate"}
      </Badge>
      <Badge variant="blue">
        <LuClock className="h-3 w-3" />
        ~{props.durationMinutes}min
      </Badge>
    </div>
  );
}

function LessonHeader({
  props,
  children,
}: {
  props: LessonPlayerProps;
  children?: React.ReactNode;
}) {
  return (
    <div className="card p-6 md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
            <LuBookOpen className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h1 className="text-xl font-bold leading-tight tracking-tight text-foreground md:text-2xl">
              {props.lessonTitle}
            </h1>
            <div className="mt-2">
              <LessonMeta props={props} />
            </div>
          </div>
        </div>
        {children}
      </div>

      {props.prerequisiteLabels.length > 0 && (
        <div className="mt-5 border-t border-border pt-4">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">
            Before you begin
          </p>
          <div className="flex flex-wrap gap-2">
            {props.prerequisiteLabels.map((label, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary px-3 py-1 text-xs font-semibold text-foreground"
              >
                <LuBookOpen className="h-3 w-3 text-primary" />
                {label}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function BlockLesson(props: LessonPlayerProps) {
  // Saved checkpoint state seeds the first render: a returning student keeps
  // the cards they cleared, and pressing on resumes at the first one they have
  // not seen instead of walking the lesson from the top again.
  // Blocks can be re-authored under a student, so ids that no longer exist are
  // dropped rather than counted towards progress.
  const savedVisited = (props.checkpoint?.visited ?? []).filter((id) =>
    props.blocks.some((block) => block.id === id),
  );
  const firstUnvisited = props.blocks.findIndex(
    (block) => !savedVisited.includes(block.id),
  );

  const [phase, setPhase] = useState<"orient" | "learn" | "complete">("orient");
  const [stepIndex, setStepIndex] = useState(
    firstUnvisited === -1 ? 0 : firstUnvisited,
  );
  const [visited, setVisited] = useState<Set<string>>(
    () => new Set(savedVisited),
  );
  const [checkResults, setCheckResults] = useState<Record<string, CheckResult>>(
    () => ({ ...(props.checkpoint?.checks ?? {}) }),
  );

  const block = props.blocks[stepIndex];
  const isLastStep = stepIndex === props.blocks.length - 1;
  const currentIsCheck = block?.type === "check";
  const currentCheckSettled =
    currentIsCheck && block && visited.has(block.id);
  const visitedCount = visited.size;

  // Persist checkpoint state as cards are advanced. Fire-and-forget; the row is
  // created on the first change and marked COMPLETED later by the practice exit.
  const hasMounted = useRef(false);
  useEffect(() => {
    if (!hasMounted.current) {
      hasMounted.current = true;
      return;
    }
    const checkpointData = {
      visited: Array.from(visited),
      checks: Object.fromEntries(
        Object.entries(checkResults).map(([id, r]) => [
          id,
          { attempts: r.attempts, correct: r.correct },
        ]),
      ),
    };
    const completionPercent = Math.min(
      100,
      Math.round((visited.size / props.blocks.length) * 100),
    );
    fetch(`/api/lessons/${props.lessonId}/progress`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: "IN_PROGRESS",
        completionPercent,
        checkpointData,
      }),
    }).catch(() => {});
  }, [visited, checkResults, phase, props.lessonId, props.blocks.length]);

  function handleCheckResult(blockId: string, attempts: number, correct: boolean) {
    setCheckResults((prev) => ({ ...prev, [blockId]: { attempts, correct } }));
    setVisited((prev) => new Set(prev).add(blockId));
  }

  function markVisited() {
    if (!block) return;
    setVisited((prev) => new Set(prev).add(block.id));
  }

  function next() {
    if (currentIsCheck && !currentCheckSettled) return;
    markVisited();
    if (isLastStep) {
      setPhase("complete");
    } else {
      setStepIndex((i) => i + 1);
    }
  }

  function prev() {
    if (stepIndex === 0) {
      setPhase("orient");
    } else {
      setStepIndex((i) => i - 1);
    }
  }

  // ── Orient ──────────────────────────────────────────────
  if (phase === "orient") {
    return (
      <div className="animate-fade-in space-y-6">
        <LessonHeader props={props} />

        <ObjectivesPanel objectives={props.objectives} />

        {props.locked ? (
          <div className="card flex flex-col items-center px-6 py-10 text-center">
            <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary text-muted">
              <LuLock className="h-7 w-7" />
            </span>
            <h2 className="text-base font-bold text-foreground">
              Finish the prerequisite first
            </h2>
            <p className="mt-1.5 max-w-md text-sm leading-relaxed text-muted">
              {props.lockedReason ??
                "This lesson builds on an earlier topic. Complete the prerequisite lesson above, then come back."}
            </p>
            <Link
              href={props.backHref}
              className={buttonClass("primary", "md", "mt-5")}
            >
              <LuChevronLeft className="h-4 w-4" />
              Back to {props.difficulty ? "topic" : "topic"}
            </Link>
          </div>
        ) : (
          <div className="card flex flex-wrap items-center justify-between gap-4 p-5">
            <div>
              <h2 className="text-sm font-bold text-foreground">
                {props.blocks.length} short cards to mastery
              </h2>
              <p className="mt-0.5 text-xs text-muted">
                One idea per card, with a knowledge check along the way.
              </p>
            </div>
            <Button variant="primary" size="lg" onClick={() => setPhase("learn")}>
              <LuPlay className="h-4 w-4" />
              Start lesson
            </Button>
          </div>
        )}
      </div>
    );
  }

  // ── Complete ────────────────────────────────────────────
  if (phase === "complete") {
    const keyPoints = props.legacy?.keyPoints ?? [];
    const score = Object.keys(checkResults).length;
    const firstTry =
      Object.values(checkResults).filter((r) => r.attempts === 1).length;

    return (
      <div className="animate-fade-in space-y-6">
        <div className="card flex flex-col items-center px-6 py-10 text-center">
          <span className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-success-soft text-success">
            <LuPartyPopper className="h-8 w-8" />
          </span>
          <h1 className="text-xl font-bold tracking-tight text-foreground">
            Cards done — now prove it
          </h1>
          <p className="mt-1.5 max-w-md text-sm leading-relaxed text-muted">
            You made it through {props.blocks.length} cards.
            {score > 0 &&
              ` You cleared ${score} knowledge check${score === 1 ? "" : "s"}${firstTry === score ? " on the first try" : ""}.`}
            {" "}One timed test stands between you and a completed lesson.
          </p>

          {keyPoints.length > 0 && (
            <div className="mt-6 w-full max-w-lg rounded-2xl border border-border bg-secondary/40 p-5 text-left">
              <h2 className="mb-3 text-sm font-bold text-foreground">
                Key points to remember
              </h2>
              <ul className="space-y-2">
                {keyPoints.map((point, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2.5 text-sm leading-relaxed text-foreground/90"
                  >
                    <LuCheck className="mt-0.5 h-4 w-4 flex-shrink-0 text-success" />
                    {point}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {props.legacy?.summary && (
            <div className="mt-4 w-full max-w-lg rounded-xl bg-primary-soft p-4 text-left">
              <p className="mb-1 text-xs font-bold uppercase tracking-wider text-primary-soft-foreground">
                Summary
              </p>
              <p className="text-sm leading-relaxed text-foreground/90">
                {props.legacy.summary}
              </p>
            </div>
          )}

          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <Link href={props.backHref} className={buttonClass("primary", "md")}>
              Back to topic
            </Link>
            <Link
              href={`/classroom/${props.subjectSlug}/${props.topicSlug}/practice`}
              className={buttonClass("success", "md", "flex-shrink-0")}
            >
              Take the practice test
              <LuArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <p className="mt-4 text-xs font-medium text-muted">
            {props.practiceCount} JAMB-style questions · 90 seconds each · pass
            mark {props.passMarkPercent}%
          </p>
        </div>
      </div>
    );
  }

  // ── Learn ───────────────────────────────────────────────
  return (
    <div className="animate-fade-in">
      <LessonHeader props={props} />

      <div className="mt-6 card p-5 md:p-7">
        <div className="mb-4 flex items-center justify-between gap-3">
          <p className="text-sm font-bold text-foreground">
            {block && block.type !== "check"
              ? `Card ${stepIndex + 1} of ${props.blocks.length}`
              : `Checkpoint — card ${stepIndex + 1} of ${props.blocks.length}`}
          </p>
          <span className="text-xs font-semibold text-muted tabular-nums">
            {Math.round((visitedCount / props.blocks.length) * 100)}% complete
          </span>
        </div>
        <Progress
          value={(visitedCount / props.blocks.length) * 100}
          tone="auto"
          className="h-1.5"
        />

        <div className="mt-6">
          {block ? (
            <MicroCard block={block} onCheckResult={handleCheckResult} />
          ) : null}
        </div>

        <div className="mt-7 flex items-center justify-between border-t border-border pt-5">
          <Button variant="ghost" onClick={prev}>
            <LuChevronLeft className="h-4 w-4" />
            {stepIndex === 0 ? "Exit" : "Previous"}
          </Button>

          <Button
            variant={isLastStep ? "success" : "primary"}
            onClick={next}
            disabled={currentIsCheck && !currentCheckSettled}
          >
            {currentIsCheck && !currentCheckSettled
              ? "Answer to continue"
              : isLastStep
                ? "Finish lesson"
                : "Next card"}
            {!currentIsCheck && <LuArrowRight className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}

// Legacy lessons (no blocks) render their markdown content inline.
function LegacyLesson(props: LessonPlayerProps) {
  const keyPoints = props.legacy?.keyPoints ?? [];
  return (
    <div className="animate-fade-in space-y-6">
      <LessonHeader props={props} />

      <ObjectivesPanel objectives={props.objectives} />

      <div className="card p-6 md:p-8">
        {props.legacy?.content ? (
          <div className="prose-sm max-w-none text-[15px] leading-relaxed text-foreground/90">
            <Markdown content={props.legacy.content} />
          </div>
        ) : (
          <p className="text-sm text-muted">
            This lesson is still being prepared.
          </p>
        )}

        {keyPoints.length > 0 && (
          <div className="mt-6 rounded-2xl border border-border bg-secondary/40 p-5">
            <h2 className="mb-3 text-sm font-bold text-foreground">Key Points</h2>
            <ul className="space-y-2">
              {keyPoints.map((point, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2.5 text-sm leading-relaxed text-foreground/90"
                >
                  <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-success" />
                  {point}
                </li>
              ))}
            </ul>
          </div>
        )}

        {props.legacy?.summary && (
          <div className="mt-5 rounded-xl bg-primary-soft p-4">
            <p className="mb-1 text-xs font-bold uppercase tracking-wider text-primary-soft-foreground">
              Summary
            </p>
            <p className="text-sm leading-relaxed text-foreground/90">
              {props.legacy.summary}
            </p>
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-border pt-5">
          <Link href={props.backHref} className={buttonClass("primary", "md")}>
            Back to topic
          </Link>
          <Link href={props.quizHref} className={buttonClass("success", "md")}>
            Take the topic quiz
            <LuArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
