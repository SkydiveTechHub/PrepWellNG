import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/page-header";
import { LessonUploadForm } from "@/components/admin/lesson-upload-form";

export const dynamic = "force-dynamic";

export default async function AdminLessonUploadPage({
  searchParams,
}: {
  searchParams: Promise<{ topicId?: string }>;
}) {
  const { topicId } = await searchParams;

  const subjects = await db.subject.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      slug: true,
      topics: {
        orderBy: { orderIndex: "asc" },
        select: {
          id: true,
          title: true,
          slug: true,
          curriculumLevel: { select: { classLevel: true, term: true } },
        },
      },
    },
  });

  return (
    <div>
      <PageHeader
        title="Upload a lesson note"
        description="Write the note as markdown, check the preview, then replace the topic's lesson."
      />
      <LessonUploadForm subjects={subjects} initialTopicId={topicId ?? null} />
    </div>
  );
}
