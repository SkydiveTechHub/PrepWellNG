import { NextRequest, NextResponse, after } from "next/server";
import { requireAdminApi } from "@/lib/admin-session";
import { recordAudit } from "@/lib/admin-audit";
import { announcementInputSchema } from "@/lib/announcement";
import { describeAudience } from "@/lib/push-audience";
import { listAnnouncements, queueAnnouncement } from "@/lib/announcement-data";
import { drainAnnouncements } from "@/lib/announcement-drain";
import { deadlineFrom } from "@/lib/cron-auth";
import { readPushConfig } from "@/lib/push-config";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET /admin/api/announcements — the 50 most recent
export async function GET() {
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;
  try {
    return NextResponse.json(await listAnnouncements());
  } catch (error) {
    console.error("Listing announcements failed:", error);
    return NextResponse.json({ error: "Failed to list announcements" }, { status: 500 });
  }
}

// POST /admin/api/announcements — queue for push and show the banner
export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;

  const parsed = announcementInputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const queued = await queueAnnouncement(parsed.data, guard.actor.id);

    await recordAudit({
      actorId: guard.actor.id,
      action: "announcement.send",
      entity: "Announcement",
      entityId: queued.id,
      summary: `Sent "${parsed.data.title}" to ${describeAudience(parsed.data.audience)} (${queued.recipientCount} devices)`,
    });

    // Start sending now instead of waiting up to a minute for pg_cron. after()
    // runs within this route's maxDuration; the cron drain finishes the rest.
    if (queued.recipientCount > 0 && readPushConfig()) {
      after(async () => {
        try {
          await drainAnnouncements({ deadline: deadlineFrom(startedAt) });
        } catch (error) {
          console.error("Immediate announcement drain failed:", error);
        }
      });
    }

    return NextResponse.json(queued, { status: 201 });
  } catch (error) {
    console.error("Queueing announcement failed:", error);
    return NextResponse.json({ error: "Failed to send announcement" }, { status: 500 });
  }
}
