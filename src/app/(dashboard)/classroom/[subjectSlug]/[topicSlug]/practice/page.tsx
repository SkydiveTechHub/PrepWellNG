import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { resolveTopicLesson, topicLessonSelect } from "@/lib/classroom";
import { PracticeExit } from "@/components/lesson/practice-exit";

export default async function TopicPracticePage({
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
      subtopics: topicLessonSelect,
    },
  });
  if (!topic) notFound();

  // Every topic has exactly one lesson (150/150 in the live database).
  const lesson = resolveTopicLesson(topic);
  const topicHref = `/classroom/${subjectSlug}/${topicSlug}`;
  if (!lesson) redirect(topicHref);

  // The practice exit is the prove gate — require the student to have started
  // the lesson's cards first so checkpoint data exists for the mastery score.
  const progress = await db.studentProgress.findUnique({
    where: {
      studentId_subjectId_topicId_lessonId: {
        studentId: session.user.id,
        subjectId: subject.id,
        topicId: topic.id,
        lessonId: lesson.id,
      },
    },
  });
  const studyHref = `${topicHref}/study`;
  if (!progress || progress.completionPercent === 0) {
    redirect(studyHref);
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PracticeExit
        subjectSlug={subjectSlug}
        topicSlug={topicSlug}
        lessonId={lesson.id}
        lessonTitle={lesson.title}
        topicTitle={topic.title}
        passMarkPercent={lesson.passMarkPercent}
        practiceCount={lesson.practiceCount}
        backHref={studyHref}
      />
    </div>
  );
}
