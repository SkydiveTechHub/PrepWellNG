import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-session";
import { recordAudit } from "@/lib/admin-audit";
import { cancelAnnouncement } from "@/lib/announcement-data";

export const dynamic = "force-dynamic";

// POST /admin/api/announcements/[id]/cancel — stop sending and hide the banner
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  try {
    const cancelled = await cancelAnnouncement(id);
    if (!cancelled) {
      return NextResponse.json(
        { error: "Only a queued or sending announcement can be cancelled" },
        { status: 409 },
      );
    }
    await recordAudit({
      actorId: guard.actor.id,
      action: "announcement.cancel",
      entity: "Announcement",
      entityId: id,
      summary: "Cancelled an announcement",
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Cancelling announcement failed:", error);
    return NextResponse.json({ error: "Failed to cancel" }, { status: 500 });
  }
}
