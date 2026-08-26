import { requireOwnerPage } from "@/lib/admin-session";
import { listAdmins } from "@/lib/admin-team";
import { PageHeader } from "@/components/ui/page-header";
import { AdminTeamManager } from "@/components/admin/admin-team-manager";

export const dynamic = "force-dynamic";

export default async function AdminTeamPage() {
  const owner = await requireOwnerPage();

  const admins = await listAdmins();

  return (
    <div>
      <PageHeader
        title="Team"
        description="Create admin accounts and hand the credentials over yourself. There is no invite email."
      />
      <AdminTeamManager
        initialAdmins={admins.map((a) => ({
          ...a,
          lastLoginAt: a.lastLoginAt?.toISOString() ?? null,
          createdAt: a.createdAt.toISOString(),
        }))}
        currentAdminId={owner.id}
      />
    </div>
  );
}
