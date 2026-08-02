import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import {
  LuArrowLeft,
  LuBookOpen,
  LuChevronDown,
  LuChevronRight,
  LuClock,
  LuPlay,
  LuTarget,
} from "react-icons/lu";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDuration } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";

const CLASS_LEVELS = ["SS1", "SS2", "SS3"] as const;
const TERMS = ["FIRST", "SECOND", "THIRD"] as const;

const TERM_LABELS: Record<string, string> = {
  FIRST: "First Term",
  SECOND: "Second Term",
  THIRD: "Third Term",
};

const CLASS_COLORS: Record<string, string> = {
  SS1: "bg-blue-50 text-blue-700 border-blue-200",
  SS2: "bg-green-50 text-green-700 border-green-200",
  SS3: "bg-purple-50 text-purple-700 border-purple-200",
};

type TopicRow = {
  id: string;
  title: string;
  slug: string;
  estimatedMinutes: number;
  curriculumLevel: { classLevel: string; term: string };
  _count: { questions: number };
};

export default async function SubjectDetailPage({
  params,
}: {
  params: Promise<{ subjectSlug: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { subjectSlug } = await params;
  const userClassLevel = (session.user as { classLevel?: string | null }).classLevel ?? null;

  const subject = await db.subject.findUnique({
    where: { slug: subjectSlug },
    include: {
      _count: { select: { questions: true, topics: true } },
      topics: {
        orderBy: { orderIndex: "asc" },
        select: {
          id: true,
          title: true,
          slug: true,
          estimatedMinutes: true,
          curriculumLevel: { select: { classLevel: true, term: true } },
          _count: { select: { questions: true } },
        },
      },
    },
  });

  if (!subject) notFound();

  const examLabels: string[] = [];
  if (subject.isWaec) examLabels.push("WAEC");
  if (subject.isJamb) examLabels.push("JAMB");
  if (subject.isNeco) examLabels.push("NECO");

  const grouped: Record<string, Record<string, TopicRow[]>> = {};
  for (const level of CLASS_LEVELS) grouped[level] = { FIRST: [], SECOND: [], THIRD: [] };
  for (const topic of subject.topics as TopicRow[]) {
    const { classLevel, term } = topic.curriculumLevel;
    if (!grouped[classLevel] || !grouped[classLevel][term]) continue;
    grouped[classLevel][term].push(topic);
  }

  const totalQuestions = subject._count.questions;

  const examBadge = (exam: string) =>
    exam === "WAEC" ? "blue" : exam === "JAMB" ? "green" : "purple";

  return (
    <div>
      <Link
        href="/subjects"
        className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-foreground"
      >
        <LuArrowLeft className="h-4 w-4" />
        All Subjects
      </Link>

      {/* Subject header */}
      <div className="card relative overflow-hidden p-6 md:p-8">
        <div className="absolute -right-12 -top-16 h-48 w-48 rounded-full bg-primary/5" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-soft text-sm font-bold text-primary">
                {subject.code}
              </span>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-foreground">
                  {subject.name}
                </h1>
                <p className="text-sm text-muted">{subject.description}</p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {examLabels.map((exam) => (
                <Badge key={exam} variant={examBadge(exam)}>
                  {exam}
                </Badge>
              ))}
            </div>
          </div>

          <Link
            href={`/practice/past-questions/${subjectSlug}`}
            className={buttonClass("primary", "lg", "flex-shrink-0")}
          >
            <LuPlay className="h-4 w-4" />
            Take Quiz
          </Link>
        </div>

        <div className="mt-6 grid grid-cols-3 gap-4 border-t border-border pt-6">
          <div className="text-center">
            <p className="text-2xl font-bold tracking-tight text-foreground">{totalQuestions}</p>
            <p className="text-xs text-muted">Questions</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold tracking-tight text-foreground">{subject._count.topics}</p>
            <p className="text-xs text-muted">Topics</p>
          </div>
          <div className="text-center">
            <Link
              href={`/practice/past-questions?subject=${subject.slug}`}
              className="inline-flex items-center gap-1.5 text-sm font-bold text-primary hover:underline"
            >
              Practice <LuChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </div>

      {/* Curriculum by class & term */}
      <div className="mt-8">
        <h2 className="section-label mb-4">Curriculum by Class</h2>
        {subject.topics.length > 0 ? (
          <div className="space-y-4">
            {CLASS_LEVELS.map((level) => {
              const terms = grouped[level];
              const topicCount = terms.FIRST.length + terms.SECOND.length + terms.THIRD.length;
              const classQuestionCount = Object.values(terms)
                .flat()
                .reduce((sum, t) => sum + t._count.questions, 0);

              return (
                <details
                  key={level}
                  open={topicCount > 0 && (!userClassLevel || userClassLevel === level)}
                  className="card group overflow-hidden"
                >
                  <summary className="flex cursor-pointer list-none select-none items-center justify-between gap-3 px-5 py-4 transition-colors hover:bg-secondary/40 [&::-webkit-details-marker]:hidden">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className={cn("chip border font-bold", CLASS_COLORS[level])}>
                        {level}
                      </span>
                      <span className="text-sm font-bold text-foreground">
                        {topicCount} topic{topicCount === 1 ? "" : "s"}
                      </span>
                      {classQuestionCount > 0 && (
                        <span className="text-xs text-muted">
                          {classQuestionCount} question{classQuestionCount === 1 ? "" : "s"}
                        </span>
                      )}
                    </div>
                    <LuChevronDown className="h-4 w-4 text-muted transition-transform group-open:rotate-180" />
                  </summary>

                  <div className="grid grid-cols-1 gap-4 border-t border-border px-5 pb-5 pt-4 md:grid-cols-3">
                    {TERMS.map((term) => {
                      const topics = terms[term];
                      if (topics.length === 0) {
                        return (
                          <div
                            key={term}
                            className="rounded-xl border border-dashed border-border p-4"
                          >
                            <h3 className="section-label mb-2">{TERM_LABELS[term]}</h3>
                            <p className="text-xs text-muted/70">No topics yet</p>
                          </div>
                        );
                      }

                      return (
                        <div key={term} className="rounded-xl border border-border bg-card p-4">
                          <h3 className="section-label mb-3">{TERM_LABELS[term]}</h3>
                          <div className="space-y-2">
                            {topics.map((topic) => (
                              <Link
                                key={topic.id}
                                href={`/subjects/${subjectSlug}/${topic.slug}`}
                                className="group/topic flex items-center justify-between gap-3 rounded-xl border border-border p-3 transition-all hover:border-primary/40 hover:shadow-soft"
                              >
                                <div className="flex min-w-0 items-center gap-2.5">
                                  <LuBookOpen className="h-3.5 w-3.5 flex-shrink-0 text-muted transition-colors group-hover/topic:text-primary" />
                                  <span className="truncate text-sm font-medium text-foreground">
                                    {topic.title}
                                  </span>
                                </div>
                                <div className="flex flex-shrink-0 items-center gap-3">
                                  {topic._count.questions > 0 && (
                                    <span className="flex items-center gap-1 text-[11px] font-semibold text-muted">
                                      <LuTarget className="h-3 w-3" />
                                      {topic._count.questions}
                                    </span>
                                  )}
                                  <span className="flex items-center gap-1 text-[11px] font-semibold text-muted">
                                    <LuClock className="h-3 w-3" />
                                    {formatDuration(topic.estimatedMinutes)}
                                  </span>
                                </div>
                              </Link>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </details>
              );
            })}
          </div>
        ) : (
          <EmptyState
            icon={<LuBookOpen className="h-6 w-6" />}
            title="No topics yet"
            description="Topics for this subject are being prepared. Check back soon."
          />
        )}
      </div>

      {/* Quick practice */}
      <div className="card mt-8 flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <h3 className="text-sm font-bold text-foreground">Quick Practice</h3>
          <p className="mt-0.5 text-xs text-muted">
            Jump straight into questions for a specific exam.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {examLabels.map((exam) => (
            <Link
              key={exam}
              href={`/practice/past-questions/${subjectSlug}?exam=${exam}`}
              className={cn(
                "rounded-xl px-4 py-2 text-sm font-bold transition-colors",
                exam === "WAEC"
                  ? "bg-blue-100 text-blue-700 hover:bg-blue-200"
                  : exam === "JAMB"
                    ? "bg-green-100 text-green-700 hover:bg-green-200"
                    : "bg-purple-100 text-purple-700 hover:bg-purple-200",
              )}
            >
              Practice {exam} Questions
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
