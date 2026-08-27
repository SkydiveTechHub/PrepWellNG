import { NextResponse } from "next/server";
import { requireOwnerApi } from "@/lib/admin-session";
import { recordAudit } from "@/lib/admin-audit";
import { getStudentDetail, revokeStudentSessions } from "@/lib/admin-student-data";
import { fullName } from "@/lib/admin-student";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireOwnerApi();
  if (!guard.ok) return guard.response;

  const { id } = await params;

  const target = await getStudentDetail(id);
  if (!target) {
    return NextResponse.json({ error: "Student not found" }, { status: 404 });
  }

  await revokeStudentSessions(id);

  await recordAudit({
    actorId: guard.actor.id,
    action: "student.force_signout",
    entity: "User",
    entityId: id,
    summary: `Signed ${fullName(target)} out of every device`,
  });

  return NextResponse.json({ ok: true });
}
