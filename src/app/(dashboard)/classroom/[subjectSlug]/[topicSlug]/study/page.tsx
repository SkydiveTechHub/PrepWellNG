import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { LuArrowLeft } from "react-icons/lu";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  deriveObjectives,
  parseBlocks,
  parsePrerequisiteLabels,
  type LessonBlock,
} from "@/lib/lesson-engine";
import { computeLessonAccess } from "@/engines/learning/availability";
import { resolveTopicLesson, topicLessonSelect } from "@/lib/classroom";
import { LessonPlayer } from "@/components/lesson/lesson-player";

export default async function StudyPage({
  params,
}: {
  params: Promise<{ subjectSlug: string; topicSlug: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { subjectSlug, topicSlug } = await params;

  const subject = await db.subject.findUnique({
    where: { slug: subjectSlug },
    select: { id: true, name: true },
  });
  if (!subject) notFound();

  const topic = await db.topic.findUnique({
    where: { subjectId_slug: { subjectId: subject.id, slug: topicSlug } },
    select: {
      id: true,
      title: true,
      prerequisiteTopicId: true,
      subtopics: topicLessonSelect,
    },
  });
  if (!topic) notFound();

  // Every topic has exactly one lesson (150/150 in the live database); a
  // topic without one falls back to the topic page rather than 404ing here.
  const lesson = resolveTopicLesson(topic);
  const backHref = `/classroom/${subjectSlug}/${topicSlug}`;
  if (!lesson) redirect(backHref);

  const blocks = parseBlocks(lesson.blocks);

  // Learning Path Engine — graph-derived per-lesson unlock (algorithm B).
  // A lesson opens when its topic's PREREQUISITE gates are met, the authoring
  // prerequisites are satisfied, and earlier lessons in the subtopic are done.
  const { lessonReady, prereqs } = await computeLessonAccess(
    db,
    session.user.id,
    subject.id,
    topic.id,
    lesson.id,
  );
  const locked = !lessonReady;
  const unmetPrereqs = prereqs.filter((prereq) => !prereq.met);

  const prerequisiteLabels = parsePrerequisiteLabels(lesson.prerequisites);
  for (const prereq of unmetPrereqs) {
    prerequisiteLabels.push(
      `Master ${prereq.title} (${prereq.need}% mastery) to unlock`,
    );
  }

  const keyPoints = Array.isArray(lesson.keyPoints)
    ? (lesson.keyPoints as string[])
    : [];
  const objectives = deriveObjectives(topic.title, subject.name);

  const quizHref = `/classroom/${subjectSlug}/${topicSlug}/quiz`;

  return (
    <div className="animate-fade-in">
      <Link
        href={backHref}
        className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-foreground"
      >
        <LuArrowLeft className="h-4 w-4" />
        {subject.name} · {topic.title}
      </Link>

      <LessonPlayer
        lessonTitle={lesson.title}
        blocks={blocks as LessonBlock[]}
        objectives={objectives}
        durationMinutes={lesson.estimatedMinutes}
        difficulty={lesson.difficulty}
        prerequisiteLabels={prerequisiteLabels}
        locked={locked}
        lockedReason={
          locked
            ? unmetPrereqs.length > 0
              ? `"${topic.title}" builds on ${unmetPrereqs
                  .map((p) => `"${p.title}" (${p.need}% mastery)`)
                  .join(" and ")}. Reach those milestones, then return to unlock this lesson.`
              : `Finish the earlier lessons in this topic, then return to unlock this one.`
            : null
        }
        legacy={{
          content: lesson.content,
          keyPoints,
          summary: lesson.summary,
        }}
        backHref={backHref}
        quizHref={quizHref}
        lessonId={lesson.id}
        subjectSlug={subjectSlug}
        topicSlug={topicSlug}
        passMarkPercent={lesson.passMarkPercent}
        practiceCount={lesson.practiceCount}
      />
    </div>
  );
}
