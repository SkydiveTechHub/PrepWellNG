import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import {
  LuArrowLeft,
  LuArrowRight,
  LuCheck,
  LuChevronRight,
  LuClock,
  LuLink,
  LuLock,
  LuTarget,
} from "react-icons/lu";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDuration } from "@/lib/utils";
import {
  computeTopicReadiness,
  loadPretestPassed,
} from "@/engines/learning/availability";
import { parseBlocks } from "@/lib/lesson-engine";
import {
  resolveTopicLesson,
  topicLessonSelect,
  topicNeighbours,
  type TopicNavItem,
} from "@/lib/classroom";
import { PretestDialog } from "@/components/path/pretest-dialog";
import { LessonNotes } from "@/components/classroom/lesson-notes";
import { TopicActionBar } from "@/components/classroom/topic-action-bar";
import { Badge } from "@/components/ui/badge";
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
      subtopics: topicLessonSelect,
      _count: { select: { questions: true } },
    },
  });
  if (!topic) notFound();

  // Every topic has exactly one lesson (150/150 in the live database), but
  // this is coded defensively — a topic somehow missing one renders the page
  // without notes or the action bar rather than crashing.
  const lesson = resolveTopicLesson(topic);

  // Everything below only depends on `subject`/`topic`/`lesson`, already in
  // hand, so it's fetched in parallel rather than as sequential awaits.
  const [pretestPassed, deck, siblingTopics, progress] = await Promise.all([
    // Learning Path Engine — graph-derived availability (algorithm B). The
    // old "any lesson completed under the prereq" gate is superseded by
    // composite mastery over every PREREQUISITE edge. A readiness pretest
    // (≥80% on 5 questions) self-certifies a topic and satisfies its
    // incoming gates.
    loadPretestPassed(db, session.user.id, subject.id),
    lesson
      ? db.flashcardDeck.findUnique({
          where: { lessonId_source: { lessonId: lesson.id, source: "LESSON" } },
          select: { id: true },
        })
      : Promise.resolve(null),
    // Sibling topics across the subject, for previous/next navigation within
    // the current class level.
    db.topic.findMany({
      where: { subjectId: subject.id },
      select: {
        slug: true,
        title: true,
        orderIndex: true,
        curriculumLevel: { select: { classLevel: true, term: true } },
      },
    }),
    // Whether the student has started the lesson's cards — gates the
    // Practice action, which requires checkpoint data to score against.
    lesson
      ? db.studentProgress.findUnique({
          where: {
            studentId_subjectId_topicId_lessonId: {
              studentId: session.user.id,
              subjectId: subject.id,
              topicId: topic.id,
              lessonId: lesson.id,
            },
          },
          select: { completionPercent: true },
        })
      : Promise.resolve(null),
  ]);
  const pretestCertified = pretestPassed.has(topic.id);
  const { ready: topicReady, state, prereqs } = await computeTopicReadiness({
    prisma: db,
    studentId: session.user.id,
    subjectId: subject.id,
    topicId: topic.id,
    pretestPassed,
  });
  const topicState = state.get(topic.id);
  const canPractice = (progress?.completionPercent ?? 0) > 0;

  const navItems: TopicNavItem[] = siblingTopics.map((t) => ({
    slug: t.slug,
    title: t.title,
    classLevel: t.curriculumLevel.classLevel,
    term: t.curriculumLevel.term,
    orderIndex: t.orderIndex,
  }));
  const { previous, next } = topicNeighbours(navItems, topicSlug);

  const { classLevel, term } = topic.curriculumLevel;
  const classColor = CLASS_COLORS[classLevel] ?? "bg-gray-50 text-gray-700 border-gray-200";

  return (
    <div className="animate-fade-in">
      <nav
        aria-label="Breadcrumb"
        className="mb-6 flex flex-wrap items-center gap-1.5 text-sm font-medium text-muted"
      >
        <Link href="/classroom" className="transition-colors hover:text-foreground">
          Classroom
        </Link>
        <LuChevronRight className="h-3.5 w-3.5 flex-shrink-0" />
        <Link
          href={`/classroom/${subjectSlug}`}
          className="transition-colors hover:text-foreground"
        >
          {subject.name}
        </Link>
        <LuChevronRight className="h-3.5 w-3.5 flex-shrink-0" />
        <span className="text-foreground">
          {classLevel} · {TERM_LABELS[term] ?? term}
        </span>
      </nav>

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

          <PretestDialog
            topicId={topic.id}
            topicTitle={topic.title}
            alreadyPassed={pretestCertified}
          />
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

      {lesson && (
        <TopicActionBar
          subjectSlug={subjectSlug}
          topicSlug={topicSlug}
          lessonId={lesson.id}
          hasDeck={Boolean(deck)}
          deckId={deck?.id ?? null}
          canPractice={canPractice}
        />
      )}

      <div className="mt-6">
        {lesson ? (
          <LessonNotes
            blocks={parseBlocks(lesson.blocks)}
            fallbackContent={lesson.content}
          />
        ) : (
          <div className="card p-6 text-sm text-muted">
            Notes for this topic are still being prepared.
          </div>
        )}
      </div>

      <div className="mt-8 flex flex-wrap items-stretch justify-between gap-3">
        {previous ? (
          <Link
            href={`/classroom/${subjectSlug}/${previous.slug}`}
            className="card flex min-w-[220px] flex-1 items-center gap-2 p-4 transition-colors hover:border-primary/40"
          >
            <LuArrowLeft className="h-4 w-4 flex-shrink-0 text-muted" />
            <span className="min-w-0">
              <span className="block text-xs font-semibold text-muted">Previous</span>
              <span className="block truncate text-sm font-bold text-foreground">
                {previous.title}
              </span>
            </span>
          </Link>
        ) : (
          <span className="flex-1" />
        )}
        {next ? (
          <Link
            href={`/classroom/${subjectSlug}/${next.slug}`}
            className="card flex min-w-[220px] flex-1 items-center justify-end gap-2 p-4 text-right transition-colors hover:border-primary/40"
          >
            <span className="min-w-0">
              <span className="block text-xs font-semibold text-muted">Next</span>
              <span className="block truncate text-sm font-bold text-foreground">
                {next.title}
              </span>
            </span>
            <LuArrowRight className="h-4 w-4 flex-shrink-0 text-muted" />
          </Link>
        ) : (
          <span className="flex-1" />
        )}
      </div>
    </div>
  );
}
