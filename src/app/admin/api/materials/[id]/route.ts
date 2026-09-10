import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-session";
import { recordAudit } from "@/lib/admin-audit";
import { materialUpdateSchema } from "@/lib/validators";
import {
  deleteMaterial,
  getMaterial,
  updateMaterial,
} from "@/lib/admin-material-data";
import { validateMaterialUrl } from "@/lib/admin-material";

export const dynamic = "force-dynamic";

// PATCH /admin/api/materials/[id] — partial update, including reordering.
//
// A URL sent without a type must be checked against the STORED type, not left
// unchecked: patching a VIDEO's url alone would otherwise slip a direct .mp4
// past the rule that keeps video on an adaptive-bitrate host.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const guard = await requireAdminApi();
    if (!guard.ok) return guard.response;

    const { id } = await params;

    const parsed = materialUpdateSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const existing = await getMaterial(id);
    if (!existing) {
      return NextResponse.json({ error: "Material not found" }, { status: 404 });
    }

    const input = parsed.data;
    const mergedType = input.resourceType ?? existing.resourceType;
    const mergedUrl = input.url ?? existing.url;
    const check = validateMaterialUrl(mergedType, mergedUrl);
    if (!check.ok) {
      return NextResponse.json(
        { error: "Validation failed", details: { fieldErrors: { url: [check.reason] } } },
        { status: 400 },
      );
    }

    const material = await updateMaterial(id, input);

    await recordAudit({
      actorId: guard.actor.id,
      action: "material.update",
      entity: "SubjectResource",
      entityId: material.id,
      summary: `Updated material "${material.title}"`,
    });

    return NextResponse.json(material);
  } catch (error) {
    console.error("Error updating material:", error);
    return NextResponse.json({ error: "Failed to update material" }, { status: 500 });
  }
}

// DELETE /admin/api/materials/[id] — remove it from the shelf
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const guard = await requireAdminApi();
    if (!guard.ok) return guard.response;

    const { id } = await params;

    const existing = await getMaterial(id);
    if (!existing) {
      return NextResponse.json({ error: "Material not found" }, { status: 404 });
    }

    await deleteMaterial(id);

    await recordAudit({
      actorId: guard.actor.id,
      action: "material.delete",
      entity: "SubjectResource",
      entityId: id,
      summary: `Deleted material "${existing.title}"`,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error deleting material:", error);
    return NextResponse.json({ error: "Failed to delete material" }, { status: 500 });
  }
}
