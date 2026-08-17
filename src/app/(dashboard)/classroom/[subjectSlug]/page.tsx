import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import {
  LuArrowLeft,
  LuBookOpen,
  LuChevronRight,
  LuPlay,
} from "react-icons/lu";
import { auth } from "@/lib/auth";
import { getSubjectPageData } from "@/lib/classroom-data";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { GraphView } from "@/components/path/graph-view";
import { CurriculumViewToggle } from "@/components/path/view-toggle";
import { ClassTermBrowser } from "@/components/classroom/class-term-browser";

export default async function SubjectDetailPage({
  params,
}: {
  params: Promise<{ subjectSlug: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { subjectSlug } = await params;
  const userClassLevel = (session.user as { classLevel?: string | null }).classLevel ?? null;

  const data = await getSubjectPageData(session.user.id, subjectSlug, userClassLevel);
  if (!data) notFound();

  const {
    subject,
    examLabels,
    hasTopics,
    graphNodes,
    graphEdges,
    masteredCount,
    readyCount,
    dueCount,
    classes,
    initialClassLevel,
  } = data;

  const examBadge = (exam: string) =>
    exam === "WAEC" ? "blue" : exam === "JAMB" ? "green" : "purple";

  return (
    <div>
      <Link
        href="/classroom"
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
            <p className="text-2xl font-bold tracking-tight text-foreground">{subject.questionCount}</p>
            <p className="text-xs text-muted">Questions</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold tracking-tight text-foreground">{subject.topicCount}</p>
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

      {/* Curriculum — list/graph toggle (Learning Path Engine, spec Stage 0) */}
      <div className="mt-8">
        <CurriculumViewToggle
          graph={
            <GraphView
              nodes={graphNodes}
              edges={graphEdges}
              subjectSlug={subject.slug}
              mastered={masteredCount}
              ready={readyCount}
              due={dueCount}
              total={subject.topicCount}
            />
          }
        >
          {hasTopics ? (
            <ClassTermBrowser
              subjectSlug={subjectSlug}
              subjectId={subject.id}
              classes={classes}
              initialClassLevel={initialClassLevel}
            />
          ) : (
            <EmptyState
              icon={<LuBookOpen className="h-6 w-6" />}
              title="No topics yet"
              description="Topics for this subject are being prepared. Check back soon."
            />
          )}
        </CurriculumViewToggle>
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
                  ? "bg-tone-blue-soft text-tone-blue-ink hover:bg-tone-blue-line"
                  : exam === "JAMB"
                    ? "bg-tone-green-soft text-tone-green-ink hover:bg-tone-green-line"
                    : "bg-tone-purple-soft text-tone-purple-ink hover:bg-tone-purple-line",
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
