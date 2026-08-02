import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import {
  LuArrowLeft,
  LuArrowRight,
  LuBookOpen,
  LuCheck,
  LuClock,
  LuPlay,
  LuTarget,
  LuSparkles,
} from "react-icons/lu";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDuration } from "@/lib/utils";
import { hasCompletedAnyLessonInTopic } from "@/lib/lesson-engine";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";

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

const DIFFICULTY: Record<string, { label: string; variant: "green" | "amber" | "red" }> = {
  BASIC: { label: "Basic", variant: "green" },
  INTERMEDIATE: { label: "Intermediate", variant: "amber" },
  ADVANCED: { label: "Advanced", variant: "red" },
};

export default async function TopicDetailPage({
  params,
}: {
  params: Promise<{ subjectSlug: string; topicSlug: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { subjectSlug, topicSlug } = await params;

  const subject = await db.subject.findUnique({
    where: { slug: subjectSlug },
    select: { id: true, name: true, code: true },
  });
  if (!subject) notFound();

  const topic = await db.topic.findUnique({
    where: { subjectId_slug: { subjectId: subject.id, slug: topicSlug } },
    include: {
      curriculumLevel: true,
      subtopics: {
        orderBy: { orderIndex: "asc" },
        include: {
          lessons: { orderBy: { createdAt: "asc" } },
        },
      },
      _count: { select: { questions: true } },
    },
  });
  if (!topic) notFound();

  const lessons = topic.subtopics.flatMap((st) => st.lessons);

  // Student progress per lesson in this topic, for hub status chips.
  const studentProgress = await db.studentProgress.findMany({
    where: {
      studentId: session.user.id,
      topicId: topic.id,
      lessonId: { not: null },
    },
    select: { lessonId: true, status: true, completionPercent: true },
  });
  const progressByLesson = new Map(
    studentProgress.map((p) => [p.lessonId, p]),
  );

  // Prerequisite gating: if the topic has a prerequisite, the lesson hub shows
  // a lock until at least one lesson under the prerequisite topic is completed.
  let prerequisiteMet = true;
  if (topic.prerequisiteTopicId) {
    prerequisiteMet = await hasCompletedAnyLessonInTopic(
      db,
      session.user.id,
      topic.prerequisiteTopicId,
    );
  }

  const { classLevel, term } = topic.curriculumLevel;
  const classColor = CLASS_COLORS[classLevel] ?? "bg-gray-50 text-gray-700 border-gray-200";

  return (
    <div className="animate-fade-in">
      <Link
        href={`/subjects/${subjectSlug}`}
        className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-foreground"
      >
        <LuArrowLeft className="h-4 w-4" />
        {subject.name}
      </Link>

      <div className="card relative overflow-hidden p-6 md:p-8">
        <div className="absolute -right-12 -top-16 h-48 w-48 rounded-full bg-primary/5" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-primary-soft text-sm font-bold text-primary">
                {subject.code}
              </span>
              <div className="min-w-0">
                <h1 className="text-2xl font-bold leading-tight tracking-tight text-foreground">
                  {topic.title}
                </h1>
                <p className="text-sm text-muted">{subject.name}</p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className={cn("chip border font-bold", classColor)}>
                {classLevel} · {TERM_LABELS[term] ?? term}
              </span>
              <Badge variant="blue">
                <LuClock className="h-3 w-3" />
                {formatDuration(topic.estimatedMinutes)}
              </Badge>
              <Badge variant="green">
                <LuTarget className="h-3 w-3" />
                {topic._count.questions} questions
              </Badge>
              {topic.waecWeight > 0 && <Badge variant="blue">WAEC weight {topic.waecWeight}</Badge>}
              {topic.jambWeight > 0 && <Badge variant="green">JAMB weight {topic.jambWeight}</Badge>}
            </div>
          </div>

          <Link
            href={`/subjects/${subjectSlug}/${topicSlug}/quiz`}
            className={buttonClass("primary", "lg", "flex-shrink-0")}
          >
            <LuPlay className="h-4 w-4" />
            Take Quiz
          </Link>
        </div>
      </div>

      <div className="mt-8 space-y-6">
        <div>
          <h2 className="mb-4 flex items-center gap-2 text-lg font-bold tracking-tight text-foreground">
            <LuBookOpen className="h-5 w-5 text-primary" />
            Lessons
          </h2>
          {lessons.length > 0 ? (
            <div className="space-y-4">
              {lessons.map((lesson) => {
                const difficulty = DIFFICULTY[lesson.difficulty] ?? {
                  label: lesson.difficulty,
                  variant: "neutral" as const,
                };
                const progress = progressByLesson.get(lesson.id);
                const isLocked = !prerequisiteMet;
                const isCompleted = progress?.status === "COMPLETED";

                return (
                  <article
                    key={lesson.id}
                    className={cn(
                      "card animate-slide-up flex flex-wrap items-center justify-between gap-4 p-5",
                      isLocked && "opacity-75",
                    )}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        className={cn(
                          "flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl",
                          isCompleted
                            ? "bg-success-soft text-success"
                            : "bg-primary-soft text-primary",
                        )}
                      >
                        {isCompleted ? (
                          <LuCheck className="h-5 w-5" />
                        ) : (
                          <LuBookOpen className="h-5 w-5" />
                        )}
                      </span>
                      <div className="min-w-0">
                        <h3 className="truncate text-base font-bold tracking-tight text-foreground">
                          {lesson.title}
                        </h3>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                          <Badge variant={difficulty.variant}>
                            {difficulty.label}
                          </Badge>
                          <span className="flex items-center gap-1">
                            <LuClock className="h-3 w-3" />
                            {formatDuration(lesson.estimatedMinutes)}
                          </span>
                          {isCompleted ? (
                            <span className="font-semibold text-success">
                              Completed
                            </span>
                          ) : progress?.status === "IN_PROGRESS" ? (
                            <span className="font-semibold text-warning">
                              In progress · {Math.round(progress.completionPercent)}%
                            </span>
                          ) : (
                            <span className="text-muted">Not started</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <Link
                      href={`/subjects/${subjectSlug}/${topicSlug}/lessons/${lesson.id}`}
                      className={buttonClass(
                        isCompleted ? "secondary" : "primary",
                        "md",
                        "flex-shrink-0",
                      )}
                    >
                      {isLocked ? "View preview" : isCompleted ? "Review" : "Start lesson"}
                      <LuArrowRight className="h-4 w-4" />
                    </Link>
                  </article>
                );
              })}
            </div>
          ) : (
            <EmptyState
              icon={<LuBookOpen className="h-6 w-6" />}
              title="No lessons yet"
              description="Lessons for this topic are being prepared by our teachers. You can still test yourself with the quiz below."
              tone="primary"
            />
          )}
        </div>
      </div>

      <div className="card mt-8 flex flex-wrap items-center justify-between gap-4 p-6">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-success-soft text-success">
            <LuSparkles className="h-5 w-5" />
          </span>
          <div>
            <h3 className="text-sm font-bold text-foreground">Ready to test yourself?</h3>
            <p className="mt-0.5 text-xs text-muted">
              {topic._count.questions > 0
                ? `${topic._count.questions} past questions are tagged to this topic.`
                : "Take a subject quiz drawn from the past question bank."}
            </p>
          </div>
        </div>
        <Link
          href={`/subjects/${subjectSlug}/${topicSlug}/quiz`}
          className={buttonClass("success", "md")}
        >
          <LuPlay className="h-4 w-4" />
          Start Topic Quiz
        </Link>
      </div>
    </div>
  );
}
