import { requireAdminPage } from "@/lib/admin-session";
import { PageHeader } from "@/components/ui/page-header";
import { listAcademicTerms } from "@/lib/academic-terms";
import { AcademicTermManager } from "@/components/admin/academic-term-manager";

export const dynamic = "force-dynamic";

export default async function AdminTermsPage() {
  // The layout's check does not re-run on client-side navigation between admin
  // routes, so each page carries its own.
  await requireAdminPage();
  const terms = await listAcademicTerms();

  return (
    <div>
      <PageHeader
        title="Term dates"
        description="The school calendar study plans follow. Set each term's first and last day."
      />
      <AcademicTermManager terms={terms} />
    </div>
  );
}
