import { redirect } from "next/navigation";
import Link from "next/link";
import {
  LuBookOpen,
  LuTarget,
  LuTrendingUp,
  LuFlame,
} from "react-icons/lu";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

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

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const stats = await getDashboardStats(session.user.id);

  const statCards = [
    {
      label: "Questions Practiced",
      value: stats.totalResponses.toString(),
      icon: LuTarget,
      color: "text-blue-600 bg-blue-50",
    },
    {
      label: "Topics Covered",
      value: stats.topicCount.toString(),
      icon: LuBookOpen,
      color: "text-green-600 bg-green-50",
    },
    {
      label: "Overall Accuracy",
      value: stats.accuracy !== null ? `${stats.accuracy}%` : "\u2014",
      icon: LuTrendingUp,
      color: "text-purple-600 bg-purple-50",
    },
    {
      label: "This Week",
      value: `${stats.lastWeekActivity} attempt${stats.lastWeekActivity === 1 ? "" : "s"}`,
      icon: LuFlame,
      color: "text-orange-600 bg-orange-50",
    },
  ];

  return (
    <div>
      {/* Welcome Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">
          Welcome back{session.user.name ? `, ${session.user.name.split(" ")[0]}` : ""}!
        </h1>
        <p className="text-muted mt-1">
          Continue where you left off. Your next study session awaits.
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {statCards.map((stat) => (
          <div
            key={stat.label}
            className="bg-card rounded-xl border border-border p-4"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${stat.color}`}>
                <stat.icon className="w-5 h-5" />
              </div>
            </div>
            <p className="text-2xl font-bold text-foreground">{stat.value}</p>
            <p className="text-xs text-muted mt-0.5">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-foreground mb-4">
          Quick Actions
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <QuickAction
            title="Practice Past Questions"
            description="WAEC, JAMB, and NECO past questions"
            href="/practice/past-questions"
            color="bg-green-600"
          />
          <QuickAction
            title="Take a Mock Exam"
            description="Simulate real exam conditions"
            href="/practice/mock-exam"
            color="bg-purple-600"
          />
          <QuickAction
            title="View Subjects"
            description="Browse all subjects and topics"
            href="/subjects"
            color="bg-blue-600"
          />
        </div>
      </div>

      {/* Recent Activity */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-4">
          Recent Activity
        </h2>
        {stats.recentAttempts.length > 0 ? (
          <div className="space-y-3">
            {stats.recentAttempts.map((attempt) => (
              <Link
                key={attempt.id}
                href={`/practice/results/${attempt.id}`}
                className="block bg-card rounded-xl border border-border p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {attempt.assessment.title}
                    </p>
                    <p className="text-xs text-muted mt-0.5">
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
                      className={`text-sm font-bold ${
                        attempt.percentage >= 50 ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {Math.round(attempt.percentage)}%
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="bg-card rounded-xl border border-border p-8 text-center">
            <p className="text-muted">
              No activity yet. Start by exploring your subjects or practicing past
              questions.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function QuickAction({
  title,
  description,
  href,
  color,
}: {
  title: string;
  description: string;
  href: string;
  color: string;
}) {
  return (
    <a
      href={href}
      className="block bg-card rounded-xl border border-border p-5 hover:shadow-md transition-shadow"
    >
      <div className={`w-2 h-2 rounded-full ${color} mb-3`} />
      <h3 className="font-semibold text-foreground text-sm">{title}</h3>
      <p className="text-xs text-muted mt-1">{description}</p>
    </a>
  );
}
