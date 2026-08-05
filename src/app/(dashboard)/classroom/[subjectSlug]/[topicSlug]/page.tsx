import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import {
  LuArrowLeft,
  LuArrowRight,
  LuBookOpen,
  LuCheck,
  LuClock,
  LuLink,
  LuLock,
  LuPlay,
  LuTarget,
  LuSparkles,
} from "react-icons/lu";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDuration } from "@/lib/utils";
import {
  computeTopicReadiness,
  lessonUnlockState,
  loadPretestPassed,
  resolvePrerequisiteEntries,
} from "@/engines/learning/availability";
import { PretestDialog } from "@/components/path/pretest-dialog";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";

const TERM_LABELS: Record<string, string> = {
  FIRST: "First Term",
  SECOND: "Second Term",
  THIRD: "Third Term",
};

const LEVEL_LABELS: Record<string, string> = {
  STRONG: "Strong",
  COMPETENT: "Competent",
  DEVELOPING: "Developing",
  WEAK: "Weak",
};

const MASTERY_VARIANT: Record<string, "green" | "amber" | "neutral"> = {
  STRONG: "green",
  COMPETENT: "green",
  DEVELOPING: "amber",
  WEAK: "neutral",
};

const CLASS_COLORS: Record<string, string> = {
  SS1: "bg-tone-blue-soft text-tone-blue-ink border-tone-blue-line",
  SS2: "bg-tone-green-soft text-tone-green-ink border-tone-green-line",
  SS3: "bg-tone-purple-soft text-tone-purple-ink border-tone-purple-line",
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

  // Learning Path Engine — graph-derived availability (algorithm B). The old
  // "any lesson completed under the prereq" gate is superseded by composite
  // mastery over every PREREQUISITE edge. A readiness pretest (≥80% on 5
  // questions) self-certifies a topic and satisfies its incoming gates.
  const pretestPassed = await loadPretestPassed(db, session.user.id, subject.id);
  const pretestCertified = pretestPassed.has(topic.id);
  const { ready: topicReady, graph, state, prereqs } = await computeTopicReadiness({
    prisma: db,
    studentId: session.user.id,
    subjectId: subject.id,
    topicId: topic.id,
    pretestPassed,
  });
  const topicState = state.get(topic.id);

  const completedLessonIds = new Set(
    studentProgress
      .filter((p) => p.status === "COMPLETED" && p.lessonId)
      .map((p) => p.lessonId as string),
  );

  const subjectLessons = await db.lesson.findMany({
    where: { subtopic: { topic: { subjectId: subject.id } } },
    select: { id: true, title: true },
  });
  const lessonIdByTitle = new Map(subjectLessons.map((l) => [l.title, l.id]));
  const topicIdByTitle = new Map(
    [...graph.nodes.values()].map((n) => [n.title, n.id]),
  );

  // Prior lessons live in the same subtopic, earlier in the authored order.
  const priorByLesson = new Map<string, string[]>();
  for (const subtopic of topic.subtopics) {
    subtopic.lessons.forEach((lesson, index) => {
      priorByLesson.set(
        lesson.id,
        subtopic.lessons.slice(0, index).map((l) => l.id),
      );
    });
  }

  const lessonViews = lessons.map((lesson) => {
    const unlocked = lessonUnlockState({
      topicReady,
      prerequisites: resolvePrerequisiteEntries(
        lesson.prerequisites,
        lessonIdByTitle,
        topicIdByTitle,
      ),
      completedLessonIds,
      state,
      priorLessonIds: priorByLesson.get(lesson.id) ?? [],
    });
    return { lesson, unlocked };
  });
  const firstStartableLessonId =
    lessonViews.find(
      (view) => view.unlocked && !completedLessonIds.has(view.lesson.id),
    )?.lesson.id ?? null;

  const { classLevel, term } = topic.curriculumLevel;
  const classColor = CLASS_COLORS[classLevel] ?? "bg-gray-50 text-gray-700 border-gray-200";

  return (
    <div className="animate-fade-in">
      <Link
        href={`/classroom/${subjectSlug}`}
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
              {topicState && (
                <>
                  <Badge variant={MASTERY_VARIANT[topicState.level] ?? "neutral"}>
                    <LuTarget className="h-3 w-3" />
                    {topicState.mastery}% mastery ·{" "}
                    {LEVEL_LABELS[topicState.level] ?? topicState.level}
                  </Badge>
                  {topicState.retention != null && (
                    <Badge
                      variant={topicState.retention < 0.8 ? "amber" : "blue"}
                    >
                      <LuClock className="h-3 w-3" />
                      Retention {Math.round(topicState.retention * 100)}%
                    </Badge>
                  )}
                </>
              )}
              {pretestCertified && (
                <Badge variant="green">
                  <LuCheck className="h-3 w-3" />
                  Certified by pretest
                </Badge>
              )}
            </div>
          </div>

          <Link
            href={`/classroom/${subjectSlug}/${topicSlug}/quiz`}
            className={buttonClass("primary", "lg", "flex-shrink-0")}
          >
            <LuPlay className="h-4 w-4" />
            Take Quiz
          </Link>
        </div>
      </div>

      {prereqs.length > 0 && (
        <div className="card mt-6 p-5">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold tracking-tight text-foreground">
            <LuLink className="h-4 w-4 text-primary" />
            Prerequisites
          </h2>
          <div className="flex flex-wrap gap-2">
            {prereqs.map((prereq) => {
              const chip = (
                <span
                  className={cn(
                    "chip border",
                    prereq.met
                      ? "border-success/30 bg-success-soft text-success"
                      : "border-tone-amber-line bg-tone-amber-soft text-tone-amber-ink",
                  )}
                >
                  {prereq.met ? (
                    <LuCheck className="h-3.5 w-3.5" />
                  ) : (
                    <LuLock className="h-3.5 w-3.5" />
                  )}
                  {prereq.title}
                  {prereq.met
                    ? " — ready"
                    : ` — needs ${prereq.need}% mastery (${Math.round(
                        prereq.mastery,
                      )}%)`}
                </span>
              );
              if (prereq.subjectId === subject.id && prereq.slug) {
                return (
                  <Link
                    key={prereq.topicId}
                    href={`/classroom/${subjectSlug}/${prereq.slug}`}
                    className="transition-opacity hover:opacity-80"
                  >
                    {chip}
                  </Link>
                );
              }
              return <span key={prereq.topicId}>{chip}</span>;
            })}
          </div>
          {!topicReady && (
            <p className="mt-3 text-xs text-muted">
              Complete the prerequisites above to unlock this topic&apos;s
              lessons.
            </p>
          )}
        </div>
      )}

      <div className="mt-8 space-y-6">
        <div>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-lg font-bold tracking-tight text-foreground">
              <LuBookOpen className="h-5 w-5 text-primary" />
              Lessons
            </h2>
            <PretestDialog
              topicId={topic.id}
              topicTitle={topic.title}
              alreadyPassed={pretestCertified}
            />
          </div>
          {lessons.length > 0 ? (
            <div className="space-y-4">
              {lessonViews.map(({ lesson, unlocked }) => {
                const difficulty = DIFFICULTY[lesson.difficulty] ?? {
                  label: lesson.difficulty,
                  variant: "neutral" as const,
                };
                const progress = progressByLesson.get(lesson.id);
                const isLocked = !unlocked;
                const isCompleted = progress?.status === "COMPLETED";
                const isStartHere = lesson.id === firstStartableLessonId;

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
                        ) : isLocked ? (
                          <LuLock className="h-5 w-5" />
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
                          {isStartHere && (
                            <span className="font-semibold text-primary">
                              Start here
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <Link
                      href={`/classroom/${subjectSlug}/${topicSlug}/lessons/${lesson.id}`}
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
          href={`/classroom/${subjectSlug}/${topicSlug}/quiz`}
          className={buttonClass("success", "md")}
        >
          <LuPlay className="h-4 w-4" />
          Start Topic Quiz
        </Link>
      </div>
    </div>
  );
}
