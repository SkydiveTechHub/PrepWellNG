import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-session";
import { canSuspendStudent } from "@/lib/admin-access";
import { recordAudit } from "@/lib/admin-audit";
import { studentStatusSchema } from "@/lib/validators";
import { getStudentDetail, setStudentActive } from "@/lib/admin-student-data";
import { fullName } from "@/lib/admin-student";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;

  if (!canSuspendStudent(guard.actor)) {
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  }

  const { id } = await params;

  const parsed = studentStatusSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const target = await getStudentDetail(id);
  if (!target) {
    return NextResponse.json({ error: "Student not found" }, { status: 404 });
  }

  const { isActive, reason } = parsed.data;
  await setStudentActive(id, isActive, reason ?? null);

  await recordAudit({
    actorId: guard.actor.id,
    action: isActive ? "student.reactivate" : "student.suspend",
    entity: "User",
    entityId: id,
    summary: isActive
      ? `Reactivated ${fullName(target)}`
      : `Suspended ${fullName(target)} — ${reason}`,
  });

  return NextResponse.json({ ok: true });
}
