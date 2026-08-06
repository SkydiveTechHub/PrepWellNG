import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { resolveTopicLesson, topicLessonSelect } from "@/lib/classroom";
import { parseBlocks, type CheckBlock } from "@/lib/lesson-engine";
import { LessonQuickQuiz } from "@/components/classroom/lesson-quick-quiz";
import { TopicBankQuiz } from "@/components/classroom/topic-bank-quiz";

// The quick quiz serves the LESSON NOTE'S OWN questions when the note has any,
// and falls back to the WAEC/JAMB bank when it does not. `/practice` is always
// the bank -- timed, JAMB-style, graded -- so the two surfaces now differ in
// source and purpose rather than only in count and timing.
//
// The fallback is load-bearing, not defensive padding: the seeded corpus is 150
// machine-generated lessons with no authored knowledge checks, so without it
// this page would be empty for nearly every topic in the database today.
// Topics move from the fallback to their own questions one uploaded note at a
// time.

export default async function TopicQuizPage({
  params,
}: {
  params: Promise<{ subjectSlug: string; topicSlug: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { subjectSlug, topicSlug } = await params;

  const subject = await db.subject.findUnique({
    where: { slug: subjectSlug },
    select: { id: true },
  });
  if (!subject) notFound();

  const topic = await db.topic.findUnique({
    where: { subjectId_slug: { subjectId: subject.id, slug: topicSlug } },
    select: { id: true, title: true, subtopics: topicLessonSelect },
  });
  if (!topic) notFound();

  const topicHref = `/classroom/${subjectSlug}/${topicSlug}`;
  const lesson = resolveTopicLesson(topic);
  const checks = lesson
    ? parseBlocks(lesson.blocks).filter((b): b is CheckBlock => b.type === "check")
    : [];

  if (checks.length === 0) {
    return (
      <TopicBankQuiz subjectSlug={subjectSlug} topicSlug={topicSlug} backHref={topicHref} />
    );
  }

  return (
    <LessonQuickQuiz
      checks={checks}
      lessonTitle={lesson?.title ?? topic.title}
      backHref={topicHref}
    />
  );
}
