import { requireAdminPage } from "@/lib/admin-session";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/admin/empty-state";
import { listMaterialSubjects, listMaterials } from "@/lib/admin-material-data";
import { MaterialManager } from "@/components/admin/material-manager";

export const dynamic = "force-dynamic";

export default async function AdminLibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ subjectId?: string }>;
}) {
  // The layout's check does not re-run on client-side navigation between admin
  // routes, so each page carries its own.
  await requireAdminPage();

  const { subjectId } = await searchParams;
  const subjects = await listMaterialSubjects();
  const materials = subjectId ? await listMaterials(subjectId) : [];

  return (
    <div>
      <PageHeader
        title="Library"
        description="File PDFs, images, videos and links under a subject. Students see them on their shelf."
      />

      {subjects.length === 0 ? (
        <EmptyState
          title="No subjects yet"
          message="Seed the subject list before adding materials."
        />
      ) : (
        <MaterialManager
          subjects={subjects}
          selectedSubjectId={subjectId ?? null}
          materials={materials}
        />
      )}
    </div>
  );
}
