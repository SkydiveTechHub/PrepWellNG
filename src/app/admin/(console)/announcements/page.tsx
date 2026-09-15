import { requireAdminPage } from "@/lib/admin-session";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBanner } from "@/components/admin/status-banner";
import { listAnnouncements } from "@/lib/announcement-data";
import { isPushEnabled } from "@/lib/push-config";
import { AnnouncementComposer } from "@/components/admin/announcement-composer";
import { AnnouncementList } from "@/components/admin/announcement-list";

export const dynamic = "force-dynamic";

export default async function AdminAnnouncementsPage() {
  // The layout's check does not re-run on client-side navigation.
  await requireAdminPage();

  const pushConfigured = isPushEnabled();
  const rows = await listAnnouncements();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Announcements"
        description="Send a notification to students' devices. Everyone in the audience also sees it as a banner on their dashboard."
      />
      {!pushConfigured && (
        <StatusBanner
          tone="info"
          title="Push is not configured"
          message="Set the VAPID keys and CRON_SECRET (docs/push-notifications-ops.md). Announcements will still show as dashboard banners."
        />
      )}
      <AnnouncementComposer pushConfigured={pushConfigured} />
      <AnnouncementList rows={rows} />
    </div>
  );
}
