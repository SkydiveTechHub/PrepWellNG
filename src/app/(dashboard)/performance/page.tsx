import { redirect } from "next/navigation";
import Link from "next/link";
import { LuTarget, LuChevronRight, LuTriangleAlert, LuGauge, LuLayers, LuFileCheck } from "react-icons/lu";
import { auth } from "@/lib/auth";
import { getGrade, getPerformanceData } from "@/lib/performance";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonClass } from "@/components/ui/button";

function getGradeVariant(grade: string): "green" | "blue" | "amber" | "orange" | "red" {
  switch (grade) {
    case "A": return "green";
    case "B": return "blue";
    case "C": return "amber";
    case "D": return "orange";
    default: return "red";
  }
}

export default async function PerformancePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const data = await getPerformanceData(session.user.id);

  const latestAttempt = data.attempts[0];
  const overallAccuracy = data.subjectMetrics.length > 0
    ? Math.round(
        data.subjectMetrics.reduce((sum, m) => sum + m.accuracy, 0) /
          data.subjectMetrics.length
      )
    : null;

  const stats = [
    {
      label: "Attempts",
      value: String(data.attempts.length),
      icon: <LuFileCheck className="h-5 w-5" />,
      iconClass: "bg-primary-soft text-primary",
    },
    {
      label: "Overall Accuracy",
      value: overallAccuracy !== null ? `${overallAccuracy}%` : "\u2014",
      icon: <LuGauge className="h-5 w-5" />,
      iconClass: "bg-success-soft text-success",
    },
    {
      label: "Latest Grade",
      value:
        latestAttempt?.percentage !== null && latestAttempt?.percentage !== undefined
          ? getGrade(latestAttempt.percentage)
          : "\u2014",
      icon: <LuTarget className="h-5 w-5" />,
      iconClass: "bg-warning-soft text-warning",
    },
    {
      label: "Subjects",
      value: String(data.subjectMetrics.length),
      icon: <LuLayers className="h-5 w-5" />,
      iconClass: "bg-tone-blue-soft text-tone-blue-ink",
    },
  ];

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Performance"
        description="Track your progress, see your grades, and identify topics that need more attention."
      />

      {data.attempts.length > 0 ? (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {stats.map((stat) => (
              <div key={stat.label} className="card p-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-muted">{stat.label}</p>
                  <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${stat.iconClass}`}>
                    {stat.icon}
                  </span>
                </div>
                <p className="mt-2 text-2xl font-bold tracking-tight text-foreground">
                  {stat.value}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-8">
            <h2 className="section-label mb-4">Subject Performance</h2>
            <div className="space-y-4">
              {data.subjectMetrics.map((metric) => {
                const weakEntry = data.subjectWeakTopics.find(
                  (w) => w.subject.slug === metric.subjectSlug
                );
                const accuracy = Math.round(metric.accuracy);
                const grade = getGrade(accuracy);

                return (
                  <div key={metric.subjectCode} className="card overflow-hidden">
                    <Link
                      href={`/classroom/${metric.subjectSlug}`}
                      className="block p-5 transition-colors hover:bg-secondary/40"
                    >
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-primary-soft text-xs font-bold text-primary">
                            {metric.subjectCode}
                          </span>
                          <div>
                            <p className="text-sm font-semibold text-foreground">
                              {metric.subjectName}
                            </p>
                            <p className="text-xs text-muted">
                              {metric.totalAttempted}{" "}
                              {metric.totalAttempted === 1 ? "question" : "questions"} ·{" "}
                              {metric.totalCorrect} correct
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <Badge variant={getGradeVariant(grade)}>{grade}</Badge>
                          <span className="text-sm font-bold text-foreground">{accuracy}%</span>
                        </div>
                      </div>
                      <Progress value={accuracy} tone="auto" />
                    </Link>

                    {weakEntry && weakEntry.topics.length > 0 && (
                      <div className="border-t border-border bg-secondary/30 px-5 py-4">
                        <p className="mb-2.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted">
                          <LuTriangleAlert className="h-3.5 w-3.5 text-warning" />
                          Topics to improve
                        </p>
                        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                          {weakEntry.topics.map((topic) => (
                            <Link
                              key={topic.slug}
                              href={`/practice/past-questions?topic=${topic.slug}`}
                              className="group flex items-center justify-between gap-2 rounded-xl border border-border bg-card px-3 py-2 transition-colors hover:border-primary/30"
                            >
                              <span className="truncate text-xs font-medium text-foreground">
                                {topic.title}
                              </span>
                              <Badge variant="red" className="flex-shrink-0">
                                {topic.wrongCount} wrong
                              </Badge>
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-8">
            <h2 className="section-label mb-4">Recent Attempts</h2>
            <div className="space-y-2.5">
              {data.attempts.slice(0, 10).map((attempt) => {
                const grade = attempt.percentage !== null ? getGrade(attempt.percentage) : null;
                return (
                  <Link
                    key={attempt.id}
                    href={`/practice/results/${attempt.id}`}
                    className="card card-interactive group flex items-center justify-between gap-3 p-4"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {attempt.title}
                      </p>
                      <p className="mt-0.5 text-xs text-muted">
                        {attempt.subjectName}
                        {attempt.completedAt &&
                          ` · ${new Date(attempt.completedAt).toLocaleDateString("en-NG", {
                            day: "numeric",
                            month: "short",
                          })}`}
                      </p>
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-3">
                      {attempt.percentage !== null && (
                        <>
                          <span className="text-xs text-muted">
                            {attempt.score?.toFixed(0)}/{attempt.totalMarks}
                          </span>
                          {grade && <Badge variant={getGradeVariant(grade)}>{grade}</Badge>}
                        </>
                      )}
                      <LuChevronRight className="h-4 w-4 text-muted transition-all group-hover:translate-x-0.5 group-hover:text-primary" />
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </>
      ) : (
        <EmptyState
          tone="primary"
          icon={<LuTarget className="h-6 w-6" />}
          title="Your performance journey starts here"
          description="Complete your first practice session to see grades, accuracy, and topics to improve."
          action={
            <Link href="/practice/past-questions" className={buttonClass("primary", "lg")}>
              Start Practicing
              <LuChevronRight className="h-4 w-4" />
            </Link>
          }
        />
      )}
    </div>
  );
}
