import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-session";
import { canEditStudent } from "@/lib/admin-access";
import { recordAudit } from "@/lib/admin-audit";
import { studentTierSchema } from "@/lib/validators";
import { getStudentDetail, setStudentTier } from "@/lib/admin-student-data";
import { fullName } from "@/lib/admin-student";
import { TIER_LABELS } from "@/lib/subscription";

export const dynamic = "force-dynamic";

// The manual override that stands in for billing. When a provider is wired, a
// Subscription row becomes the source of truth that writes User.tier and this
// route becomes the comp/correction path rather than the only path.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;

  if (!canEditStudent(guard.actor)) {
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  }

  const { id } = await params;

  const parsed = studentTierSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed" }, { status: 400 });
  }

  const before = await getStudentDetail(id);
  if (!before) {
    return NextResponse.json({ error: "Student not found" }, { status: 404 });
  }

  await setStudentTier(id, parsed.data.tier, {
    period: parsed.data.period,
    grantedById: guard.actor.id,
    note: parsed.data.note ?? null,
  });

  const summary =
    parsed.data.tier === "FREEMIUM"
      ? `Revoked ${fullName(before)}'s subscription (was ${TIER_LABELS[before.tier]})`
      : `Comped ${fullName(before)} ${TIER_LABELS[parsed.data.tier]} for ${
          parsed.data.period === "YEARLY" ? "a year" : "a month"
        } (was ${TIER_LABELS[before.tier]})`;

  await recordAudit({
    actorId: guard.actor.id,
    action: "student.tier",
    entity: "User",
    entityId: id,
    summary,
  });

  return NextResponse.json({ ok: true });
}
