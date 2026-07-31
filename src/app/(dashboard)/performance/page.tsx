import { redirect } from "next/navigation";
import Link from "next/link";
import { LuTarget, LuTrendingUp, LuChevronRight, LuTriangleAlert } from "react-icons/lu";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

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

  // Calculate per-subject weak topics from question responses
  const wrongResponses = await db.questionResponse.findMany({
    where: {
      attempt: { studentId: userId },
      isCorrect: false,
      question: { topicId: { not: null }, topic: { title: { not: undefined } } },
    },
    select: {
      question: {
        select: {
          topic: { select: { id: true, title: true, slug: true } },
          subject: { select: { id: true, name: true, slug: true, code: true } },
        },
      },
    },
  });

  // Aggregate weak topics by subject, then by frequency
  const weakBySubject = new Map<string, {
    subject: { id: string; name: string; slug: string; code: string };
    topics: Map<string, { title: string; slug: string; wrongCount: number }>;
  }>();

  for (const r of wrongResponses) {
    const topic = r.question.topic;
    if (!topic) continue;
    const sub = r.question.subject;

    if (!weakBySubject.has(sub.id)) {
      weakBySubject.set(sub.id, { subject: sub, topics: new Map() });
    }
    const entry = weakBySubject.get(sub.id)!;
    const existing = entry.topics.get(topic.id);
    if (existing) {
      existing.wrongCount++;
    } else {
      entry.topics.set(topic.id, { title: topic.title, slug: topic.slug, wrongCount: 1 });
    }
  }

  // Convert to sorted array — subjects with most wrong answers first, topics sorted within
  const subjectWeakTopics = [...weakBySubject.values()]
    .map((entry) => ({
      subject: entry.subject,
      topics: [...entry.topics.entries()]
        .sort((a, b) => b[1].wrongCount - a[1].wrongCount)
        .slice(0, 5)
        .map(([, v]) => v),
    }))
    .filter((entry) => entry.topics.length > 0);

  return { attempts, subjectMetrics, subjectWeakTopics };
}

function getGrade(percentage: number): string {
  if (percentage >= 75) return "A";
  if (percentage >= 65) return "B";
  if (percentage >= 50) return "C";
  if (percentage >= 40) return "D";
  return "F";
}

function getGradeColor(grade: string): string {
  switch (grade) {
    case "A": return "text-green-600 bg-green-50 border-green-200";
    case "B": return "text-blue-600 bg-blue-50 border-blue-200";
    case "C": return "text-amber-600 bg-amber-50 border-amber-200";
    case "D": return "text-orange-600 bg-orange-50 border-orange-200";
    default: return "text-red-600 bg-red-50 border-red-200";
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

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">Performance</h1>
        <p className="text-muted mt-1">
          Track your progress, see your grades, and identify topics that need more attention.
        </p>
      </div>

      {/* Overall Stats */}
      {data.attempts.length > 0 ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="bg-card rounded-xl border border-border p-4">
            <p className="text-xs text-muted mb-1">Attempts</p>
            <p className="text-2xl font-bold text-foreground">{data.attempts.length}</p>
          </div>
          <div className="bg-card rounded-xl border border-border p-4">
            <p className="text-xs text-muted mb-1">Overall Accuracy</p>
            <p className="text-2xl font-bold text-foreground">
              {overallAccuracy !== null ? `${overallAccuracy}%` : "\u2014"}
            </p>
          </div>
          <div className="bg-card rounded-xl border border-border p-4">
            <p className="text-xs text-muted mb-1">Latest Grade</p>
            {latestAttempt?.percentage !== null && latestAttempt?.percentage !== undefined ? (
              <p className={`text-2xl font-bold ${getGradeColor(getGrade(latestAttempt.percentage)).split(" ")[0]}`}>
                {getGrade(latestAttempt.percentage)}
              </p>
            ) : (
              <p className="text-2xl font-bold text-muted">\u2014</p>
            )}
          </div>
          <div className="bg-card rounded-xl border border-border p-4">
            <p className="text-xs text-muted mb-1">Subjects</p>
            <p className="text-2xl font-bold text-foreground">{data.subjectMetrics.length}</p>
          </div>
        </div>
      ) : (
        <div className="bg-card rounded-xl border border-border p-8 text-center mb-8">
          <LuTarget className="w-10 h-10 text-muted mx-auto mb-3" />
          <p className="text-muted">
            Complete your first practice session to see performance data.
          </p>
          <Link
            href="/practice/past-questions"
            className="inline-flex items-center gap-1.5 mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium"
          >
            Start Practicing <LuChevronRight className="w-4 h-4" />
          </Link>
        </div>
      )}

      {/* Subject Performance (with weak topics) */}
      {data.subjectMetrics.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-foreground mb-4">
            Subject Performance
          </h2>
          <div className="space-y-4">
            {data.subjectMetrics.map((metric) => {
              const weakEntry = data.subjectWeakTopics.find(
                (w) => w.subject.slug === metric.subject.slug
              );
              return (
                <div
                  key={metric.subject.code}
                  className="bg-card rounded-xl border border-border overflow-hidden"
                >
                  <Link
                    href={`/subjects/${metric.subject.slug}`}
                    className="block p-4 hover:bg-secondary/30 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">
                          {metric.subject.code}
                        </span>
                        <span className="font-medium text-foreground text-sm">
                          {metric.subject.name}
                        </span>
                      </div>
                      <span className="text-sm font-bold text-foreground">
                        {Math.round(metric.accuracy)}%
                      </span>
                    </div>
                    <div className="w-full bg-border rounded-full h-1.5">
                      <div
                        className={`h-1.5 rounded-full ${
                          metric.accuracy >= 65 ? "bg-green-500" : metric.accuracy >= 40 ? "bg-amber-500" : "bg-red-500"
                        }`}
                        style={{ width: `${Math.round(metric.accuracy)}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-xs text-muted mt-1.5">
                      <span>{metric.totalAttempted} questions</span>
                      <span>{metric.totalCorrect} correct</span>
                    </div>
                  </Link>

                  {/* Weak topics for this subject */}
                  {weakEntry && weakEntry.topics.length > 0 && (
                    <div className="border-t border-border px-4 py-3 bg-secondary/20">
                      <p className="text-xs font-medium text-muted mb-2">
                        Topics to improve
                      </p>
                      <div className="space-y-1.5">
                        {weakEntry.topics.map((topic) => (
                          <Link
                            key={topic.slug}
                            href={`/practice/past-questions?topic=${topic.slug}`}
                            className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-card transition-colors group"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <LuTriangleAlert className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                              <span className="text-xs text-foreground truncate">
                                {topic.title}
                              </span>
                            </div>
                            <span className="text-xs font-medium text-red-500 flex-shrink-0 ml-2">
                              {topic.wrongCount} wrong
                            </span>
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
      )}

      {/* Recent Attempts */}
      {data.attempts.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-foreground mb-4">
            Recent Attempts
          </h2>
          <div className="space-y-2">
            {data.attempts.slice(0, 10).map((attempt) => {
              const grade = attempt.percentage !== null ? getGrade(attempt.percentage) : null;
              return (
                <Link
                  key={attempt.id}
                  href={`/practice/results/${attempt.id}`}
                  className="flex items-center justify-between bg-card border border-border rounded-lg p-4 hover:shadow-md transition-all group"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {attempt.assessment.title}
                    </p>
                    <p className="text-xs text-muted mt-0.5">
                      {attempt.assessment.subject?.name}
                      {attempt.completedAt &&
                        ` \u00b7 ${new Date(attempt.completedAt).toLocaleDateString("en-NG", {
                          day: "numeric",
                          month: "short",
                        })}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    {attempt.percentage !== null && (
                      <>
                        <span className="text-xs text-muted">
                          {attempt.score?.toFixed(0)}/{attempt.totalMarks}
                        </span>
                        {grade && (
                          <span
                            className={`text-xs font-bold px-2 py-0.5 rounded-full border ${getGradeColor(grade)}`}
                          >
                            {grade}
                          </span>
                        )}
                      </>
                    )}
                    <LuChevronRight className="w-4 h-4 text-muted group-hover:text-primary transition-colors" />
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
