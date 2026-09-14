import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-session";
import { recordAudit } from "@/lib/admin-audit";
import { academicTermSchema } from "@/lib/validators";
import { deleteAcademicTerm, saveAcademicTerm } from "@/lib/academic-terms";

export const dynamic = "force-dynamic";

// PATCH /admin/api/academic-terms/[id] — replace a term's dates
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const guard = await requireAdminApi();
    if (!guard.ok) return guard.response;
    const { id } = await params;

    const parsed = academicTermSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const saved = await saveAcademicTerm(parsed.data, id);
    if (!saved.ok) {
      return NextResponse.json({ error: saved.errors.join(" ") }, { status: saved.status });
    }

    await recordAudit({
      actorId: guard.actor.id,
      action: "academic-term.update",
      entity: "AcademicTerm",
      entityId: id,
      summary: `Changed ${saved.term.session} ${saved.term.term} term to ${saved.term.startsOn} – ${saved.term.endsOn}`,
    });

    return NextResponse.json(saved.term);
  } catch (error) {
    console.error("Error updating academic term:", error);
    return NextResponse.json({ error: "Failed to save term" }, { status: 500 });
  }
}

// DELETE /admin/api/academic-terms/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const guard = await requireAdminApi();
    if (!guard.ok) return guard.response;
    const { id } = await params;

    if (!(await deleteAcademicTerm(id))) {
      return NextResponse.json({ error: "Term not found" }, { status: 404 });
    }

    await recordAudit({
      actorId: guard.actor.id,
      action: "academic-term.delete",
      entity: "AcademicTerm",
      entityId: id,
      summary: "Deleted an academic term",
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error deleting academic term:", error);
    return NextResponse.json({ error: "Failed to delete term" }, { status: 500 });
  }
}
