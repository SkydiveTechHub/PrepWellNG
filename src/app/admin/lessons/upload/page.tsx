import { getLessonUploadSubjects } from "@/lib/admin-data";
import { PageHeader } from "@/components/ui/page-header";
import { LessonUploadForm } from "@/components/admin/lesson-upload-form";

export const dynamic = "force-dynamic";

export default async function AdminLessonUploadPage({
  searchParams,
}: {
  searchParams: Promise<{ topicId?: string }>;
}) {
  const { topicId } = await searchParams;

  const subjects = await getLessonUploadSubjects();

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
