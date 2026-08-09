import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getTopicPracticeData } from "@/lib/classroom-topic";
import { PracticeExit } from "@/components/lesson/practice-exit";

export default async function TopicPracticePage({
  params,
}: {
  params: Promise<{ subjectSlug: string; topicSlug: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { subjectSlug, topicSlug } = await params;
  const topicHref = `/classroom/${subjectSlug}/${topicSlug}`;

  const data = await getTopicPracticeData(subjectSlug, topicSlug);
  if (!data) notFound();
  if (data === "no-lesson") redirect(topicHref);

  return (
    <div className="mx-auto max-w-4xl">
      <PracticeExit
        subjectSlug={subjectSlug}
        topicSlug={topicSlug}
        lessonTitle={data.lessonTitle}
        topicTitle={data.topicTitle}
        passMarkPercent={data.passMarkPercent}
        practiceCount={data.practiceCount}
        backHref={`${topicHref}/study`}
      />
    </div>
  );
}
