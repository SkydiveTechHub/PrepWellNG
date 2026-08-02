import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { PracticeExit } from "@/components/lesson/practice-exit";

export default async function LessonPracticePage({
  params,
}: {
  params: Promise<{
    subjectSlug: string;
    topicSlug: string;
    lessonId: string;
  }>;
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
    select: { id: true, title: true },
  });
  if (!topic) notFound();

  const lesson = await db.lesson.findUnique({
    where: { id: lessonId },
    include: {
      subtopic: { select: { topicId: true } },
    },
  });
  if (!lesson || lesson.subtopic.topicId !== topic.id) notFound();

  // The practice exit is the prove gate — require the student to have started
  // the lesson's cards first so checkpoint data exists for the mastery score.
  const progress = await db.studentProgress.findUnique({
    where: {
      studentId_subjectId_topicId_lessonId: {
        studentId: session.user.id,
        subjectId: subject.id,
        topicId: topic.id,
        lessonId,
      },
    },
  });
  if (!progress || progress.completionPercent === 0) {
    redirect(
      `/subjects/${subjectSlug}/${topicSlug}/lessons/${lessonId}`,
    );
  }

  const backHref = `/subjects/${subjectSlug}/${topicSlug}/lessons/${lessonId}`;

  return (
    <div className="mx-auto max-w-4xl">
      <PracticeExit
        subjectSlug={subjectSlug}
        topicSlug={topicSlug}
        lessonId={lessonId}
        lessonTitle={lesson.title}
        topicTitle={topic.title}
        passMarkPercent={lesson.passMarkPercent}
        practiceCount={lesson.practiceCount}
        backHref={backHref}
      />
    </div>
  );
}
