import { redirect } from "next/navigation";
import Link from "next/link";
import {
  LuTarget,
  LuBookOpen,
  LuTrendingUp,
  LuFlame,
  LuArrowRight,
  LuFileText,
  LuTimer,
  LuMonitor,
  LuBook,
  LuSparkles,
  LuCompass,
  LuTriangleAlert,
  LuRotateCcw,
} from "react-icons/lu";
import { auth } from "@/lib/auth";
import { getDashboardData } from "@/lib/dashboard";
import { Greeting } from "@/components/ui/greeting";
import { Progress } from "@/components/ui/progress";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { NextTopics } from "@/components/path/next-topics";
import { GapList } from "@/components/path/gap-list";
import { RevisionQueue } from "@/components/path/revision-queue";

const STAT_CARDS = [
  {
    key: "questions",
    label: "Questions Practiced",
    icon: LuTarget,
    tile: "bg-primary-soft text-primary",
  },
  {
    key: "topics",
    label: "Topics Covered",
    icon: LuBookOpen,
    tile: "bg-success-soft text-success",
  },
  {
    key: "accuracy",
    label: "Overall Accuracy",
    icon: LuTrendingUp,
    tile: "bg-tone-purple-soft text-tone-purple-ink",
  },
  {
    key: "week",
    label: "This Week",
    icon: LuFlame,
    tile: "bg-tone-orange-soft text-tone-orange-ink",
  },
];

const QUICK_LINKS = [
  {
    title: "Past Questions",
    description: "WAEC · JAMB · NECO",
    href: "/practice/past-questions",
    icon: LuFileText,
    tile: "bg-tone-green-soft text-tone-green-ink",
  },
  {
    title: "Mock Exam",
    description: "Timed, full-length",
    href: "/practice/mock-exam",
    icon: LuTimer,
    tile: "bg-tone-purple-soft text-tone-purple-ink",
  },
  {
    title: "JAMB CBT",
    description: "180 questions · 2hrs",
    href: "/practice/cbt",
    icon: LuMonitor,
    tile: "bg-tone-blue-soft text-tone-blue-ink",
  },
  {
    title: "Classroom",
    description: "Notes, quizzes and practice",
    href: "/classroom",
    icon: LuBookOpen,
    tile: "bg-primary-soft text-primary",
  },
  {
    title: "Flashcards",
    description: "Spaced repetition",
    href: "/flashcards",
    icon: LuSparkles,
    tile: "bg-tone-indigo-soft text-tone-indigo-ink",
  },
  {
    title: "Library",
    description: "Textbooks & notes",
    href: "/library",
    icon: LuBook,
    tile: "bg-tone-amber-soft text-tone-amber-ink",
  },
];

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const {
    totalResponses,
    accuracy,
    topicCount,
    lastWeekActivity,
    // "Next for you" and "Revise today" stay hidden until the student has
    // engaged somewhere — see getDashboardData for what counts as activity.
    hasActivity,
    hasStudyPlan,
    bestScore,
    recentAttempts,
    subjects,
    learningPicks,
    gaps,
    revision,
  } = await getDashboardData(session.user.id);

  const firstName = session.user.name?.split(" ")[0];

  const statValues: Record<string, string> = {
    questions: totalResponses.toString(),
    topics: topicCount.toString(),
    accuracy: accuracy !== null ? `${accuracy}%` : "—",
    week: `${lastWeekActivity} attempt${lastWeekActivity === 1 ? "" : "s"}`,
  };

  return (
    <div className="space-y-8">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-hero-from via-hero-via to-hero-to p-6 shadow-lift md:p-8">
        <div className="absolute -right-16 -top-24 h-64 w-64 rounded-full bg-white/10" />
        <div className="absolute -bottom-24 -left-10 h-56 w-56 rounded-full bg-white/10" />
        <div className="absolute right-24 top-10 hidden h-10 w-10 rounded-2xl bg-white/10 md:block" />
        <div className="relative flex flex-wrap items-center justify-between gap-6">
          <div className="max-w-xl">
            <h1 className="text-2xl font-bold tracking-tight text-white md:text-3xl">
              <Greeting name={firstName} />!
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-hero-ink">
              {hasActivity
                ? "You're making real progress. A little focus each day compounds into a great result."
                : "Every champion starts with a first question. Let's take yours together."}
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href="/practice/past-questions"
                className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-hero-from shadow-soft transition-transform hover:scale-[1.02] active:scale-[0.98]"
              >
                <LuSparkles className="h-4 w-4" />
                Start practicing
              </Link>
              {/* Without a plan there is nothing to "view" — the link has to
                  ask for the thing that doesn't exist yet. */}
              <Link
                href="/study-plan"
                className="inline-flex items-center gap-2 rounded-xl border border-white/30 bg-white/10 px-4 py-2.5 text-sm font-bold text-white backdrop-blur transition-colors hover:bg-white/20"
              >
                {hasStudyPlan ? "View study plan" : "Create study plan"}
                <LuArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>

          {hasActivity && bestScore !== null && (
            <div className="rounded-2xl bg-white/10 px-6 py-4 text-center backdrop-blur">
              <p className="text-3xl font-bold text-white">{bestScore.toFixed(1)}%</p>
              <p className="mt-0.5 text-xs font-medium text-hero-ink">
                Best recent score
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Stats */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="section-label">Your progress</h2>
          {hasActivity && accuracy !== null && (
            <span className="text-xs font-semibold text-muted">
              {totalResponses} questions answered
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
          {STAT_CARDS.map((stat) => (
            <div
              key={stat.key}
              className="card card-interactive p-4 md:p-5"
            >
              <div
                className={cn(
                  "mb-3 flex h-10 w-10 items-center justify-center rounded-xl",
                  stat.tile,
                )}
              >
                <stat.icon className="h-5 w-5" />
              </div>
              <p className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">
                {statValues[stat.key]}
              </p>
              <p className="mt-0.5 text-xs font-medium text-muted">
                {stat.label}
              </p>
              {stat.key === "accuracy" && accuracy !== null && (
                <Progress value={accuracy} className="mt-3 h-1.5" tone="auto" />
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Learning path — next for you (hidden until the student has activity) */}
      {hasActivity && (
        <section>
          <h2 className="mb-3 section-label">Next for you</h2>
          <div className="grid gap-6 lg:grid-cols-2 lg:gap-4">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-soft text-primary">
                  <LuCompass className="h-4 w-4" />
                </span>
                <div>
                  <h3 className="text-sm font-bold text-foreground">Keep learning</h3>
                  <p className="text-xs text-muted">
                    Ranked by what helps most next
                  </p>
                </div>
              </div>
              {learningPicks.length > 0 ? (
                <NextTopics items={learningPicks} subjects={subjects} />
              ) : (
                <div className="card p-4 text-sm text-muted">
                  Nothing to learn right now — try a subject quiz to keep the
                  momentum going.
                </div>
              )}
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-tone-red-soft text-tone-red-ink">
                  <LuTriangleAlert className="h-4 w-4" />
                </span>
                <div>
                  <h3 className="text-sm font-bold text-foreground">
                    Tighten your gaps
                  </h3>
                  <p className="text-xs text-muted">
                    Weak spots ranked by how much they unlock
                  </p>
                </div>
              </div>
              {gaps.length > 0 ? (
                <GapList items={gaps.slice(0, 4)} subjects={subjects} />
              ) : (
                <div className="card p-4 text-sm text-muted">
                  No gaps detected — every topic is at your target mastery.
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Learning path — revise today (hidden until the student has activity) */}
      {hasActivity && (
        <section>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-tone-orange-soft text-tone-orange-ink">
                <LuRotateCcw className="h-4 w-4" />
              </span>
              <div>
                <h3 className="text-sm font-bold text-foreground">
                  Revise today
                </h3>
                <p className="text-xs text-muted">
                  Merged from your flashcard reviews and revision schedule
                </p>
              </div>
              {revision.length > 0 && (
                <span className="ml-auto rounded-full bg-tone-orange-soft px-2.5 py-0.5 text-xs font-bold text-tone-orange-ink">
                  {revision.length} due
                </span>
              )}
            </div>
            {revision.length > 0 ? (
              <RevisionQueue items={revision} subjects={subjects} />
            ) : (
              <div className="card p-4 text-sm text-muted">
                Nothing due for revision — your retention is holding up.
              </div>
            )}
          </div>
        </section>
      )}

      {/* Quick launch */}
      <section>
        <h2 className="mb-3 section-label">Jump back in</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4">
          {QUICK_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="card card-interactive group flex items-center gap-3 p-4"
            >
              <div
                className={cn(
                  "flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl transition-transform group-hover:scale-110",
                  link.tile,
                )}
              >
                <link.icon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-foreground">
                  {link.title}
                </p>
                <p className="truncate text-xs text-muted">{link.description}</p>
              </div>
              <LuArrowRight className="h-4 w-4 flex-shrink-0 text-muted transition-all group-hover:translate-x-0.5 group-hover:text-primary" />
            </Link>
          ))}
        </div>
      </section>

      {/* Recent activity */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="section-label">Recent activity</h2>
          {recentAttempts.length > 0 && (
            <Link
              href="/performance"
              className="text-xs font-bold text-primary hover:underline"
            >
              View all
            </Link>
          )}
        </div>
        {recentAttempts.length > 0 ? (
          <div className="space-y-3">
            {recentAttempts.map((attempt) => (
              <Link
                key={attempt.id}
                href={`/practice/results/${attempt.id}`}
                className="card card-interactive group flex items-center justify-between gap-4 p-4"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {attempt.title}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    {attempt.completedAt
                      ? new Date(attempt.completedAt).toLocaleDateString("en-NG", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })
                      : "In progress"}
                  </p>
                </div>
                {attempt.percentage !== null && (
                  <span
                    className={cn(
                      "flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold",
                      attempt.percentage >= 50
                        ? "border-success/30 bg-success-soft text-success"
                        : "border-tone-red-line bg-tone-red-soft text-danger",
                    )}
                  >
                    {Math.round(attempt.percentage)}%
                  </span>
                )}
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<LuTarget className="h-6 w-6" />}
            title="Ready when you are"
            description="No attempts yet. Start with a subject quiz or a set of past questions — you'll see your history here."
            action={
              <Link
                href="/practice/past-questions"
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground shadow-soft transition-colors hover:bg-primary-hover"
              >
                Pick your first quiz
                <LuArrowRight className="h-4 w-4" />
              </Link>
            }
          />
        )}
      </section>
    </div>
  );
}
