import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-session";
import { recordAudit } from "@/lib/admin-audit";
import { testSendSchema } from "@/lib/announcement";
import { findStudentByContact, sendTestPush } from "@/lib/announcement-data";
import { readPushConfig } from "@/lib/push-config";

export const dynamic = "force-dynamic";

// POST /admin/api/announcements/test — send to one student's devices right now
export async function POST(req: NextRequest) {
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;

  if (!readPushConfig()) {
    return NextResponse.json({ error: "Push is not configured" }, { status: 503 });
  }

  const parsed = testSendSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const student = await findStudentByContact(parsed.data.contact);
    if (!student) {
      return NextResponse.json({ error: "No student with that email or phone" }, { status: 404 });
    }
    const result = await sendTestPush(student.id, parsed.data);

    await recordAudit({
      actorId: guard.actor.id,
      action: "announcement.test",
      entity: "User",
      entityId: student.id,
      summary: `Test announcement "${parsed.data.title}" to ${student.firstName} ${student.lastName} (${result.sent}/${result.devices} devices)`,
    });

    return NextResponse.json({ ...result, student: `${student.firstName} ${student.lastName}` });
  } catch (error) {
    console.error("Test announcement failed:", error);
    return NextResponse.json({ error: "Failed to send test" }, { status: 500 });
  }
}
