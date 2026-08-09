import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import {
  LuArrowLeft,
  LuBookOpen,
  LuCheck,
  LuSparkles,
  LuTarget,
  LuTriangleAlert,
  LuTrophy,
  LuX,
} from "react-icons/lu";
import { auth } from "@/lib/auth";
import { recordTopicPracticeResult } from "@/lib/topic-practice-result";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { PracticeResultActions } from "@/components/lesson/practice-result-actions";

const MASTERY_BADGE: Record<string, "green" | "blue" | "amber" | "red"> = {
  STRONG: "green",
  COMPETENT: "blue",
  DEVELOPING: "amber",
  WEAK: "red",
};

const MASTERY_LABEL: Record<string, string> = {
  STRONG: "Strong",
  COMPETENT: "Competent",
  DEVELOPING: "Developing",
  WEAK: "Weak",
};

export default async function TopicPracticeResultPage({
  params,
  searchParams,
}: {
  params: Promise<{ subjectSlug: string; topicSlug: string }>;
  searchParams: Promise<{ attemptId?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { subjectSlug, topicSlug } = await params;
  const { attemptId } = await searchParams;

  const topicHref = `/classroom/${subjectSlug}/${topicSlug}`;
  const studyHref = `${topicHref}/study`;
  if (!attemptId) redirect(studyHref);

  const outcome = await recordTopicPracticeResult(
    session.user.id,
    subjectSlug,
    topicSlug,
    attemptId,
  );
  if (outcome.status === "not-found") notFound();
  if (outcome.status === "no-lesson") redirect(topicHref);
  if (outcome.status === "no-attempt") redirect(studyHref);

  const {
    topicTitle,
    passMarkPercent,
    percentage,
    passed,
    bestMastery,
    masteryLevel,
    score,
    totalMarks,
    completedAt,
    nextRevisionAt,
    missed,
  } = outcome.result;

  const practiceHref = `${topicHref}/practice`;

  return (
    <div className="mx-auto max-w-3xl space-y-6 animate-fade-in">
      <Link
        href={studyHref}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-foreground"
      >
        <LuArrowLeft className="h-4 w-4" />
        Back to lesson
      </Link>

      {/* Score hero */}
      <div
        className={cn(
          "card relative overflow-hidden p-6 md:p-8",
          passed ? "ring-1 ring-success/20" : "ring-1 ring-warning/20",
        )}
      >
        <div
          className={cn(
            "absolute -right-10 -top-10 h-40 w-40 rounded-full opacity-10",
            passed ? "bg-success" : "bg-warning",
          )}
        />
        <div className="relative">
          <span
            className={cn(
              "mb-4 flex h-14 w-14 items-center justify-center rounded-2xl",
              passed ? "bg-success-soft text-success" : "bg-warning-soft text-warning",
            )}
          >
            {passed ? <LuTrophy className="h-7 w-7" /> : <LuTarget className="h-7 w-7" />}
          </span>
          <h1 className="text-xl font-bold tracking-tight text-foreground md:text-2xl">
            {passed
              ? "Practice passed — lesson complete"
              : "Not there yet — keep going"}
          </h1>
          <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-muted">
            {passed
              ? `You cleared the ${passMarkPercent}% pass mark for ${topicTitle}. Your mastery is locked in at ${bestMastery}% (${MASTERY_LABEL[masteryLevel]}).`
              : `You scored ${Math.round(percentage)}% against a ${passMarkPercent}% pass mark. The questions you missed are listed below — revisit those cards, then retry.`}
          </p>

          <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p
                className={cn(
                  "text-4xl font-bold tracking-tight md:text-5xl",
                  passed ? "text-success" : "text-warning",
                )}
              >
                {Math.round(percentage)}%
              </p>
              <p className="mt-0.5 text-xs font-medium text-muted">
                {score}/{totalMarks} correct · pass mark{" "}
                {passMarkPercent}%
              </p>
            </div>
            {passed && (
              <div className="flex flex-col items-end gap-2">
                <Badge variant={MASTERY_BADGE[masteryLevel]} className="text-sm">
                  <LuSparkles className="h-3.5 w-3.5" />
                  {MASTERY_LABEL[masteryLevel]} mastery
                </Badge>
                <span className="text-xs font-medium text-muted">
                  Next revision scheduled for{" "}
                  {new Date(nextRevisionAt).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                  })}
                </span>
              </div>
            )}
          </div>

          <PracticeResultActions
            passed={passed}
            completedAt={completedAt}
            practiceHref={practiceHref}
            lessonHref={studyHref}
            topicHref={topicHref}
            subjectSlug={subjectSlug}
            topicSlug={topicSlug}
          />
        </div>
      </div>

      {/* Remediation on fail */}
      {!passed && missed.length > 0 && (
        <div className="card p-6">
          <div className="mb-5 flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-danger-soft text-danger">
              <LuTriangleAlert className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-base font-bold text-foreground">
                Review your misses
              </h2>
              <p className="text-xs text-muted">
                {missed.length} question{missed.length === 1 ? "" : "s"} to fix
                before the next attempt.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {missed.map((q, i) => {
              return (
                <div key={q.id} className="overflow-hidden rounded-xl border border-danger/25">
                  <div className="flex items-start gap-3 bg-danger-soft/40 p-4">
                    <span className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-danger text-white">
                      <LuX className="h-3.5 w-3.5" />
                    </span>
                    <p className="flex-1 text-sm leading-relaxed text-foreground">
                      <span className="mr-1 font-bold text-muted">Q{i + 1}.</span>
                      {q.questionText}
                    </p>
                  </div>
                  <div className="border-t border-border/50 p-4">
                    {q.options && (
                      <div className="space-y-2">
                        {Object.entries(q.options).map(([key, value]) => (
                          <div
                            key={key}
                            className={cn(
                              "flex items-center gap-2.5 rounded-lg border px-3 py-2 text-sm",
                              key === q.correctAnswer
                                ? "border-success/30 bg-success-soft"
                                : "bg-secondary/50",
                            )}
                          >
                            <span
                              className={cn(
                                "flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold",
                                key === q.correctAnswer
                                  ? "bg-success text-white"
                                  : "bg-border text-muted",
                              )}
                            >
                              {key}
                            </span>
                            <span className="flex-1 text-foreground">
                              {value as string}
                            </span>
                            {key === q.correctAnswer && (
                              <LuCheck className="h-4 w-4 flex-shrink-0 text-success" />
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    <p className="mt-3 text-sm leading-relaxed text-foreground/90">
                      {q.explanation}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          <Link
            href={studyHref}
            className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-primary transition-colors hover:text-primary-hover"
          >
            <LuBookOpen className="h-4 w-4" />
            Revisit the cards these questions came from
          </Link>
        </div>
      )}
    </div>
  );
}
