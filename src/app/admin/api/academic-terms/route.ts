import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-session";
import { recordAudit } from "@/lib/admin-audit";
import { academicTermSchema } from "@/lib/validators";
import { listAcademicTerms, saveAcademicTerm } from "@/lib/academic-terms";

export const dynamic = "force-dynamic";

// GET /admin/api/academic-terms — the school calendar, earliest first
export async function GET() {
  try {
    const guard = await requireAdminApi();
    if (!guard.ok) return guard.response;
    return NextResponse.json(await listAcademicTerms());
  } catch (error) {
    console.error("Error listing academic terms:", error);
    return NextResponse.json({ error: "Failed to list terms" }, { status: 500 });
  }
}

// POST /admin/api/academic-terms — add a term
export async function POST(req: NextRequest) {
  try {
    const guard = await requireAdminApi();
    if (!guard.ok) return guard.response;

    const parsed = academicTermSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const saved = await saveAcademicTerm(parsed.data);
    if (!saved.ok) {
      return NextResponse.json({ error: saved.errors.join(" ") }, { status: saved.status });
    }

    await recordAudit({
      actorId: guard.actor.id,
      action: "academic-term.create",
      entity: "AcademicTerm",
      entityId: saved.term.id,
      summary: `Set ${saved.term.session} ${saved.term.term} term: ${saved.term.startsOn} to ${saved.term.endsOn}`,
    });

    return NextResponse.json(saved.term, { status: 201 });
  } catch (error) {
    console.error("Error creating academic term:", error);
    return NextResponse.json({ error: "Failed to save term" }, { status: 500 });
  }
}
