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
  LuAward,
  LuSparkles,
} from "react-icons/lu";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Greeting } from "@/components/ui/greeting";
import { Progress } from "@/components/ui/progress";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";

async function getDashboardStats(userId: string) {
  const [
    totalResponses,
    correctResponses,
    distinctTopics,
    recentAttempts,
    lastWeekActivity,
  ] = await db.$transaction([
    db.questionResponse.count({
      where: { attempt: { studentId: userId } },
    }),
    db.questionResponse.count({
      where: { attempt: { studentId: userId }, isCorrect: true },
    }),
    db.questionResponse.findMany({
      where: { attempt: { studentId: userId }, question: { topicId: { not: null } } },
      select: { question: { select: { topicId: true } } },
      distinct: ["questionId"],
    }),
    db.assessmentAttempt.findMany({
      where: { studentId: userId, status: "COMPLETED" },
      orderBy: { completedAt: "desc" },
      take: 5,
      select: { id: true, percentage: true, completedAt: true, assessment: { select: { title: true } } },
    }),
    db.assessmentAttempt.count({
      where: {
        studentId: userId,
        status: "COMPLETED",
        completedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
    }),
  ]);

  const topicCount = new Set(distinctTopics.map((r) => r.question.topicId).filter(Boolean)).size;
  const accuracy = totalResponses > 0 ? Math.round((correctResponses / totalResponses) * 100) : null;

  return { totalResponses, accuracy, topicCount, recentAttempts, lastWeekActivity };
}

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
    tile: "bg-purple-100 text-purple-700",
  },
  {
    key: "week",
    label: "This Week",
    icon: LuFlame,
    tile: "bg-orange-100 text-orange-600",
  },
];

const QUICK_LINKS = [
  {
    title: "Past Questions",
    description: "WAEC · JAMB · NECO",
    href: "/practice/past-questions",
    icon: LuFileText,
    tile: "bg-green-100 text-green-700",
  },
  {
    title: "Mock Exam",
    description: "Timed, full-length",
    href: "/practice/mock-exam",
    icon: LuTimer,
    tile: "bg-purple-100 text-purple-700",
  },
  {
    title: "JAMB CBT",
    description: "180 questions · 2hrs",
    href: "/practice/cbt",
    icon: LuMonitor,
    tile: "bg-blue-100 text-blue-700",
  },
  {
    title: "Subjects",
    description: "Browse curriculum",
    href: "/subjects",
    icon: LuBookOpen,
    tile: "bg-primary-soft text-primary",
  },
  {
    title: "Flashcards",
    description: "Spaced repetition",
    href: "/flashcards",
    icon: LuSparkles,
    tile: "bg-indigo-100 text-indigo-700",
  },
  {
    title: "Library",
    description: "Textbooks & notes",
    href: "/library",
    icon: LuBook,
    tile: "bg-amber-100 text-amber-700",
  },
  {
    title: "Achievements",
    description: "Badges & streaks",
    href: "/achievements",
    icon: LuAward,
    tile: "bg-rose-100 text-rose-600",
  },
];

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const stats = await getDashboardStats(session.user.id);
  const firstName = session.user.name?.split(" ")[0];

  const bestScore = stats.recentAttempts.length
    ? Math.max(...stats.recentAttempts.map((a) => a.percentage ?? 0))
    : null;
  const hasActivity = stats.totalResponses > 0;

  const statValues: Record<string, string> = {
    questions: stats.totalResponses.toString(),
    topics: stats.topicCount.toString(),
    accuracy: stats.accuracy !== null ? `${stats.accuracy}%` : "—",
    week: `${stats.lastWeekActivity} attempt${stats.lastWeekActivity === 1 ? "" : "s"}`,
  };

  return (
    <div className="space-y-8">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary via-blue-600 to-brand p-6 shadow-lift md:p-8">
        <div className="absolute -right-16 -top-24 h-64 w-64 rounded-full bg-white/10" />
        <div className="absolute -bottom-24 -left-10 h-56 w-56 rounded-full bg-white/10" />
        <div className="absolute right-24 top-10 hidden h-10 w-10 rounded-2xl bg-white/10 md:block" />
        <div className="relative flex flex-wrap items-center justify-between gap-6">
          <div className="max-w-xl">
            <h1 className="text-2xl font-bold tracking-tight text-white md:text-3xl">
              <Greeting name={firstName} />!
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-blue-100">
              {hasActivity
                ? "You're making real progress. A little focus each day compounds into a great result."
                : "Every champion starts with a first question. Let's take yours together."}
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href="/practice/past-questions"
                className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-primary shadow-soft transition-transform hover:scale-[1.02] active:scale-[0.98]"
              >
                <LuSparkles className="h-4 w-4" />
                Start practicing
              </Link>
              <Link
                href="/study-plan"
                className="inline-flex items-center gap-2 rounded-xl border border-white/30 bg-white/10 px-4 py-2.5 text-sm font-bold text-white backdrop-blur transition-colors hover:bg-white/20"
              >
                View study plan
                <LuArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>

          {hasActivity && bestScore !== null && (
            <div className="rounded-2xl bg-white/10 px-6 py-4 text-center backdrop-blur">
              <p className="text-3xl font-bold text-white">{bestScore}%</p>
              <p className="mt-0.5 text-xs font-medium text-blue-100">
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
          {hasActivity && stats.accuracy !== null && (
            <span className="text-xs font-semibold text-muted">
              {stats.totalResponses} questions answered
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
              {stat.key === "accuracy" && stats.accuracy !== null && (
                <Progress value={stats.accuracy} className="mt-3 h-1.5" tone="auto" />
              )}
            </div>
          ))}
        </div>
      </section>

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
          {stats.recentAttempts.length > 0 && (
            <Link
              href="/performance"
              className="text-xs font-bold text-primary hover:underline"
            >
              View all
            </Link>
          )}
        </div>
        {stats.recentAttempts.length > 0 ? (
          <div className="space-y-3">
            {stats.recentAttempts.map((attempt) => (
              <Link
                key={attempt.id}
                href={`/practice/results/${attempt.id}`}
                className="card card-interactive group flex items-center justify-between gap-4 p-4"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {attempt.assessment.title}
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
                        : "border-red-200 bg-red-50 text-danger",
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
