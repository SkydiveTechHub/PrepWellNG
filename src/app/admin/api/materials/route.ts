import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-session";
import { recordAudit } from "@/lib/admin-audit";
import { materialCreateSchema } from "@/lib/validators";
import { createMaterial, listMaterials } from "@/lib/admin-material-data";

export const dynamic = "force-dynamic";

// GET /admin/api/materials?subjectId= — one subject's materials, in shelf order
export async function GET(req: NextRequest) {
  try {
    const guard = await requireAdminApi();
    if (!guard.ok) return guard.response;

    const subjectId = new URL(req.url).searchParams.get("subjectId");
    if (!subjectId) {
      return NextResponse.json({ error: "subjectId is required" }, { status: 400 });
    }

    return NextResponse.json(await listMaterials(subjectId));
  } catch (error) {
    console.error("Error listing materials:", error);
    return NextResponse.json({ error: "Failed to list materials" }, { status: 500 });
  }
}

// POST /admin/api/materials — file a new material under a subject
export async function POST(req: NextRequest) {
  try {
    const guard = await requireAdminApi();
    if (!guard.ok) return guard.response;

    const parsed = materialCreateSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const material = await createMaterial(parsed.data);

    await recordAudit({
      actorId: guard.actor.id,
      action: "material.create",
      entity: "SubjectResource",
      entityId: material.id,
      summary: `Added ${material.resourceType} material "${material.title}"`,
    });

    return NextResponse.json(material, { status: 201 });
  } catch (error) {
    console.error("Error creating material:", error);
    return NextResponse.json({ error: "Failed to create material" }, { status: 500 });
  }
}
