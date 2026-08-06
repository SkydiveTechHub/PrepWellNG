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

  // Practice is deliberately NOT gated on having studied the lesson. The gate
  // used to be `completionPercent === 0`, which unlocked after a single card —
  // so the UI promised a prerequisite it never really enforced. Rather than
  // tighten it, the product decision was to drop it: a student who already
  // knows a topic should be able to go straight to the questions.
  const studyHref = `${topicHref}/study`;

  return (
    <div className="mx-auto max-w-4xl">
      <PracticeExit
        subjectSlug={subjectSlug}
        topicSlug={topicSlug}
        lessonTitle={lesson.title}
        topicTitle={topic.title}
        passMarkPercent={lesson.passMarkPercent}
        practiceCount={lesson.practiceCount}
        backHref={studyHref}
      />
    </div>
  );
}
