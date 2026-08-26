import { NextRequest, NextResponse } from "next/server";
import { requireOwnerApi } from "@/lib/admin-session";
import { canDeactivate } from "@/lib/admin-access";
import { recordAudit } from "@/lib/admin-audit";
import { adminStatusSchema } from "@/lib/validators";
import { findAdminForStatusChange, setAdminActive } from "@/lib/admin-team";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireOwnerApi();
  if (!guard.ok) return guard.response;

  const { id } = await params;

  const parsed = adminStatusSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed" }, { status: 400 });
  }

  const target = await findAdminForStatusChange(id);
  if (!target) {
    return NextResponse.json({ error: "Admin not found" }, { status: 404 });
  }

  // The owner is never deactivatable, whatever the client posts.
  if (!parsed.data.isActive && !canDeactivate(target, guard.actor)) {
    return NextResponse.json(
      { error: "The owner account cannot be deactivated" },
      { status: 403 },
    );
  }

  await setAdminActive(id, parsed.data.isActive);

  await recordAudit({
    actorId: guard.actor.id,
    action: parsed.data.isActive ? "admin.reactivate" : "admin.deactivate",
    entity: "Admin",
    entityId: target.id,
    summary: `${parsed.data.isActive ? "Reactivated" : "Deactivated"} admin ${
      target.email ?? target.username
    }`,
  });

  return NextResponse.json({ ok: true });
}
