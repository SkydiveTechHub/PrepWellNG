import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getTopicQuizData } from "@/lib/classroom-topic";
import { LessonQuickQuiz } from "@/components/classroom/lesson-quick-quiz";
import { TopicBankQuiz } from "@/components/classroom/topic-bank-quiz";

// The quick quiz serves the LESSON NOTE'S OWN questions when the note has any,
// and falls back to the WAEC/JAMB bank when it does not. `/practice` is always
// the bank -- timed, JAMB-style, graded -- so the two surfaces now differ in
// source and purpose rather than only in count and timing.

export default async function TopicQuizPage({
  params,
}: {
  params: Promise<{ subjectSlug: string; topicSlug: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { subjectSlug, topicSlug } = await params;

  const data = await getTopicQuizData(subjectSlug, topicSlug);
  if (!data) notFound();

  const topicHref = `/classroom/${subjectSlug}/${topicSlug}`;

  if (data.checks.length === 0) {
    return (
      <TopicBankQuiz subjectSlug={subjectSlug} topicSlug={topicSlug} backHref={topicHref} />
    );
  }

  return (
    <LessonQuickQuiz
      checks={data.checks}
      lessonTitle={data.lessonTitle}
      backHref={topicHref}
    />
  );
}
