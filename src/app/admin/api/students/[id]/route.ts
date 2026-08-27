import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireAdminApi, requireOwnerApi } from "@/lib/admin-session";
import { canDeleteStudent, canEditStudent } from "@/lib/admin-access";
import { recordAudit } from "@/lib/admin-audit";
import { studentProfileSchema } from "@/lib/validators";
import {
  deleteStudent,
  getStudentDeletionImpact,
  getStudentDetail,
  updateStudentProfile,
} from "@/lib/admin-student-data";
import { fullName } from "@/lib/admin-student";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;

  if (!canEditStudent(guard.actor)) {
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  }

  const { id } = await params;

  const parsed = studentProfileSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const before = await getStudentDetail(id);
  if (!before) {
    return NextResponse.json({ error: "Student not found" }, { status: 404 });
  }

  try {
    await updateStudentProfile(id, parsed.data);
  } catch (error) {
    console.error("Student profile update failed:", error);

    // Only P2002 (unique constraint) is actually the admin's mistake. Telling
    // them "the email is already in use" after a connection drop or a bad
    // schoolId sends them chasing a duplicate that does not exist — so the
    // blame is only assigned when the database says so.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const target = error.meta?.target as string[] | undefined;
      const field = target?.includes("phone") ? "phone number" : "email";
      return NextResponse.json(
        { error: `That ${field} already belongs to another account.` },
        { status: 409 },
      );
    }

    return NextResponse.json(
      { error: "Could not save. Please try again." },
      { status: 500 },
    );
  }

  // Only the fields that actually moved, so the audit row stays readable.
  const beforeRecord = before as unknown as Record<string, unknown>;
  const changes = Object.entries(parsed.data)
    .filter(([key, value]) => beforeRecord[key] !== value)
    .map(([key, value]) => `${key}: ${String(beforeRecord[key] ?? "—")} → ${String(value ?? "—")}`)
    .join("; ");

  await recordAudit({
    actorId: guard.actor.id,
    action: "student.update",
    entity: "User",
    entityId: id,
    summary: `Updated ${fullName(before)}${changes ? ` — ${changes}` : " — no fields changed"}`,
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // Owner only, and enforced here regardless of what the UI showed.
  const guard = await requireOwnerApi();
  if (!guard.ok) return guard.response;

  if (!canDeleteStudent(guard.actor)) {
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  }

  const { id } = await params;

  const target = await getStudentDetail(id);
  if (!target) {
    return NextResponse.json({ error: "Student not found" }, { status: 404 });
  }

  const name = fullName(target);
  const impact = await getStudentDeletionImpact(id);
  const destroyed = Object.entries(impact)
    .filter(([, count]) => count > 0)
    .map(([label, count]) => `${label}: ${count}`)
    .join("; ");

  // Audited BEFORE the delete: the cascade takes the account with it, and a
  // failed audit write must not be what leaves the deletion unrecorded.
  await recordAudit({
    actorId: guard.actor.id,
    action: "student.delete",
    entity: "User",
    entityId: id,
    summary: `Deleted ${name} (${target.email ?? target.phone ?? "no contact"})${
      destroyed ? ` — destroyed ${destroyed}` : " — no associated records"
    }`,
  });

  await deleteStudent(id);

  return NextResponse.json({ ok: true });
}
