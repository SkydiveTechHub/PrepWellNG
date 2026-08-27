import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { LuArrowLeft } from "react-icons/lu";
import { auth } from "@/lib/auth";
import { getTopicStudyData } from "@/lib/classroom-topic";
import { LessonPlayer } from "@/components/lesson/lesson-player";

export default async function StudyPage({
  params,
}: {
  params: Promise<{ subjectSlug: string; topicSlug: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { subjectSlug, topicSlug } = await params;
  const backHref = `/classroom/${subjectSlug}/${topicSlug}`;

  const data = await getTopicStudyData(session.user.id, subjectSlug, topicSlug);
  if (!data) notFound();
  // Every topic has exactly one lesson (150/150 in the live database); a topic
  // without one falls back to the topic page rather than 404ing here.
  if (data === "no-lesson") redirect(backHref);

  return (
    <div className="animate-fade-in">
      <Link
        href={backHref}
        className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-foreground"
      >
        <LuArrowLeft className="h-4 w-4" />
        {data.subjectName} · {data.topicTitle}
      </Link>

      <LessonPlayer
        lessonTitle={data.lessonTitle}
        blocks={data.blocks}
        objectives={data.objectives}
        durationMinutes={data.estimatedMinutes}
        difficulty={data.difficulty}
        prerequisiteLabels={data.prerequisiteLabels}
        locked={data.locked}
        lockedReason={data.lockedReason}
        legacy={data.legacy}
        backHref={backHref}
        quizHref={`/classroom/${subjectSlug}/${topicSlug}/quiz`}
        lessonId={data.lessonId}
        subjectSlug={subjectSlug}
        topicSlug={topicSlug}
        passMarkPercent={data.passMarkPercent}
        practiceCount={data.practiceCount}
        checkpoint={data.checkpoint}
      />
    </div>
  );
}
