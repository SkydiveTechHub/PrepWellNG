import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-session";
import { recordAudit } from "@/lib/admin-audit";
import { adminQuestionUpdateSchema } from "@/lib/validators";
import { getAdminQuestion, updateAdminQuestion } from "@/lib/admin-question-data";
import { revalidateTag } from "next/cache";
import { CATALOGUE_TAG } from "@/lib/catalogue";

export const dynamic = "force-dynamic";

// GET /admin/api/questions/[id] — single question for the edit form
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const guard = await requireAdminApi();
    if (!guard.ok) return guard.response;

    const { id } = await params;

    const question = await getAdminQuestion(id);
    if (!question) {
      return NextResponse.json({ error: "Question not found" }, { status: 404 });
    }

    return NextResponse.json(question);
  } catch (error) {
    console.error("Error loading question:", error);
    return NextResponse.json({ error: "Failed to load question" }, { status: 500 });
  }
}

// PATCH /admin/api/questions/[id] — partial update.
// The invariants must be checked against the record MERGED with the patch,
// not the patch alone — a patch that rewrites `options` without resending
// `correctAnswer` would otherwise pass validation and leave a question whose
// correct answer is no longer one of its options.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const guard = await requireAdminApi();
    if (!guard.ok) return guard.response;

    const { id } = await params;

    const parsed = adminQuestionUpdateSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const patch = parsed.data;

    const result = await updateAdminQuestion(id, patch);

    if (result.outcome === "not-found") {
      return NextResponse.json({ error: "Question not found" }, { status: 404 });
    }
    if (result.outcome === "invalid") {
      return NextResponse.json(
        {
          error: result.issues[0].message,
          field: result.issues[0].field,
          issues: result.issues,
        },
        { status: 400 },
      );
    }
    if (result.outcome === "bad-topic") {
      return NextResponse.json(
        { error: result.ownership.message, field: result.ownership.field },
        { status: 400 },
      );
    }

    await recordAudit({
      actorId: guard.actor.id,
      action: "question.update",
      entity: "Question",
      entityId: id,
      summary: `Updated fields: ${Object.keys(patch).join(", ")}`,
    });

    revalidateTag(CATALOGUE_TAG, "max");

    return NextResponse.json({ id });
  } catch (error) {
    console.error("Error updating question:", error);
    return NextResponse.json({ error: "Failed to update question" }, { status: 500 });
  }
}
