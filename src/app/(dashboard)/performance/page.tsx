import { redirect } from "next/navigation";
import Link from "next/link";
import { LuTarget, LuChevronRight, LuTriangleAlert, LuGauge, LuLayers, LuFileCheck } from "react-icons/lu";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonClass } from "@/components/ui/button";

async function getPerformanceData(userId: string) {
  const [attempts, subjectMetrics] = await db.$transaction([
    db.assessmentAttempt.findMany({
      where: { studentId: userId, status: "COMPLETED" },
      orderBy: { completedAt: "desc" },
      take: 20,
      select: {
        id: true,
        percentage: true,
        score: true,
        totalMarks: true,
        completedAt: true,
        assessment: { select: { title: true, subjectId: true, subject: { select: { name: true, slug: true } } } },
      },
    }),
    db.performanceMetric.findMany({
      where: { studentId: userId },
      select: {
        totalAttempted: true,
        totalCorrect: true,
        accuracy: true,
        masteryLevel: true,
        subject: { select: { name: true, slug: true, code: true } },
      },
      orderBy: { accuracy: "desc" },
    }),
  ]);

  // Weak topics, aggregated in the database. This used to pull every wrong
  // response the student had ever given — two joins, no bound — and count them
  // in JS. The grouped form returns one row per (subject, topic) instead.
  const weakRows = await db.$queryRaw<
    {
      subjectId: string;
      subjectName: string;
      subjectSlug: string;
      subjectCode: string;
      topicTitle: string;
      topicSlug: string;
      wrongCount: number;
    }[]
  >`
    SELECT s.id            AS "subjectId",
           s.name          AS "subjectName",
           s.slug          AS "subjectSlug",
           s.code          AS "subjectCode",
           t.title         AS "topicTitle",
           t.slug          AS "topicSlug",
           COUNT(*)::int   AS "wrongCount"
    FROM "QuestionResponse" qr
    JOIN "AssessmentAttempt" aa ON aa.id = qr."attemptId"
    JOIN "Question" q          ON q.id  = qr."questionId"
    JOIN "Subject" s           ON s.id  = q."subjectId"
    JOIN "Topic" t             ON t.id  = q."topicId"
    WHERE aa."studentId" = ${userId}
      AND qr."isCorrect" = false
    GROUP BY s.id, s.name, s.slug, s.code, t.id, t.title, t.slug
    ORDER BY "wrongCount" DESC
  `;

  const weakBySubject = new Map<
    string,
    {
      subject: { id: string; name: string; slug: string; code: string };
      topics: { title: string; slug: string; wrongCount: number }[];
    }
  >();

  // Rows arrive sorted by wrongCount, so the first five per subject are the worst five.
  for (const row of weakRows) {
    let entry = weakBySubject.get(row.subjectId);
    if (!entry) {
      entry = {
        subject: {
          id: row.subjectId,
          name: row.subjectName,
          slug: row.subjectSlug,
          code: row.subjectCode,
        },
        topics: [],
      };
      weakBySubject.set(row.subjectId, entry);
    }
    if (entry.topics.length < 5) {
      entry.topics.push({
        title: row.topicTitle,
        slug: row.topicSlug,
        wrongCount: row.wrongCount,
      });
    }
  }

  const subjectWeakTopics = [...weakBySubject.values()].filter(
    (entry) => entry.topics.length > 0,
  );

  return { attempts, subjectMetrics, subjectWeakTopics };
}

function getGrade(percentage: number): string {
  if (percentage >= 75) return "A";
  if (percentage >= 65) return "B";
  if (percentage >= 50) return "C";
  if (percentage >= 40) return "D";
  return "F";
}

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
                  (w) => w.subject.slug === metric.subject.slug
                );
                const accuracy = Math.round(metric.accuracy);
                const grade = getGrade(accuracy);

                return (
                  <div key={metric.subject.code} className="card overflow-hidden">
                    <Link
                      href={`/subjects/${metric.subject.slug}`}
                      className="block p-5 transition-colors hover:bg-secondary/40"
                    >
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-primary-soft text-xs font-bold text-primary">
                            {metric.subject.code}
                          </span>
                          <div>
                            <p className="text-sm font-semibold text-foreground">
                              {metric.subject.name}
                            </p>
                            <p className="text-xs text-muted">
                              {metric.totalAttempted} questions · {metric.totalCorrect} correct
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
                        {attempt.assessment.title}
                      </p>
                      <p className="mt-0.5 text-xs text-muted">
                        {attempt.assessment.subject?.name}
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
