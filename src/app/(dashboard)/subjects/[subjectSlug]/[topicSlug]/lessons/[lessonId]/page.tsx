import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { LuArrowLeft } from "react-icons/lu";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  deriveObjectives,
  hasCompletedAnyLessonInTopic,
  parseBlocks,
  parsePrerequisiteLabels,
  type LessonBlock,
} from "@/lib/lesson-engine";
import { LessonPlayer } from "@/components/lesson/lesson-player";

export default async function LessonPage({
  params,
}: {
  params: Promise<{ subjectSlug: string; topicSlug: string; lessonId: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { subjectSlug, topicSlug, lessonId } = await params;

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
    },
  });
  if (!topic) notFound();

  const lesson = await db.lesson.findUnique({
    where: { id: lessonId },
    include: {
      subtopic: { select: { topicId: true } },
    },
  });
  if (!lesson || lesson.subtopic.topicId !== topic.id) notFound();

  const blocks = parseBlocks(lesson.blocks);

  // Prerequisite gating — the topic's prerequisite must have at least one
  // completed lesson before this lesson unlocks. Lesson-level prerequisites
  // from the authoring metadata are informational for now.
  let locked = false;
  if (topic.prerequisiteTopicId) {
    const prereqMet = await hasCompletedAnyLessonInTopic(
      db,
      session.user.id,
      topic.prerequisiteTopicId,
    );
    locked = !prereqMet;
  }

  const prerequisiteLabels = parsePrerequisiteLabels(lesson.prerequisites);
  if (topic.prerequisiteTopicId) {
    const prereqTopic = await db.topic.findUnique({
      where: { id: topic.prerequisiteTopicId },
      select: { title: true },
    });
    if (prereqTopic) {
      prerequisiteLabels.push(
        `Complete: ${prereqTopic.title} (prerequisite)`,
      );
    }
  }

  const keyPoints = Array.isArray(lesson.keyPoints)
    ? (lesson.keyPoints as string[])
    : [];
  const objectives = deriveObjectives(topic.title, subject.name);

  const backHref = `/subjects/${subjectSlug}/${topicSlug}`;
  const quizHref = `/subjects/${subjectSlug}/${topicSlug}/quiz`;

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
            ? `"${topic.title}" builds on its prerequisite topic. Complete the prerequisite lesson, then return to unlock this one.`
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
