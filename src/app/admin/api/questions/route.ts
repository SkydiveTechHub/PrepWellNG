import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-session";
import { recordAudit } from "@/lib/admin-audit";
import {
  adminQuestionCreateSchema,
  adminQuestionDeleteSchema,
} from "@/lib/validators";
import {
  createAdminQuestion,
  deleteAdminQuestions,
  listAdminQuestions,
} from "@/lib/admin-question-data";
import { revalidateTag } from "next/cache";
import { CATALOGUE_TAG } from "@/lib/catalogue";

export const dynamic = "force-dynamic";

// GET /admin/api/questions — list/search questions (admin)
export async function GET(req: NextRequest) {
  try {
    const guard = await requireAdminApi();
    if (!guard.ok) return guard.response;

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get("pageSize") || "20")),
    );

    return NextResponse.json(
      await listAdminQuestions(
        {
          subjectId: searchParams.get("subjectId"),
          examType: searchParams.get("examType"),
          examYear: searchParams.get("examYear"),
          difficulty: searchParams.get("difficulty"),
          search: searchParams.get("search"),
        },
        page,
        pageSize,
      ),
    );
  } catch (error) {
    console.error("Error listing questions:", error);
    return NextResponse.json(
      { error: "Failed to list questions" },
      { status: 500 }
    );
  }
}

// POST /admin/api/questions — create a question
export async function POST(req: NextRequest) {
  try {
    const guard = await requireAdminApi();
    if (!guard.ok) return guard.response;

    const parsed = adminQuestionCreateSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const input = parsed.data;

    const result = await createAdminQuestion(input);

    if (result.outcome === "unknown-subject") {
      return NextResponse.json({ error: "Unknown subject" }, { status: 400 });
    }
    if (result.outcome === "bad-topic") {
      return NextResponse.json(
        { error: result.ownership.message, field: result.ownership.field },
        { status: 400 },
      );
    }

    await recordAudit({
      actorId: guard.actor.id,
      action: "question.create",
      entity: "Question",
      entityId: result.id,
      summary: `Created ${result.subjectCode} ${input.examType} question`,
    });

    revalidateTag(CATALOGUE_TAG, "max");

    return NextResponse.json({ id: result.id }, { status: 201 });
  } catch (error) {
    console.error("Error creating question:", error);
    return NextResponse.json({ error: "Failed to create question" }, { status: 500 });
  }
}

// DELETE /admin/api/questions?id=xxx — delete a single question (compat) or
// DELETE /admin/api/questions with a JSON body of { ids } — bulk delete.
// Dependents (question responses and assessment slots) are counted first and
// refused explicitly rather than left to surface as an opaque FK-restrict 500.
export async function DELETE(req: NextRequest) {
  try {
    const guard = await requireAdminApi();
    if (!guard.ok) return guard.response;

    // Single-id query param kept for compatibility; a body of ids is the
    // bulk form.
    const { searchParams } = new URL(req.url);
    const singleId = searchParams.get("id");

    let ids: string[];
    if (singleId) {
      ids = [singleId];
    } else {
      const parsed = adminQuestionDeleteSchema.safeParse(await req.json());
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Provide an id query parameter or a body of ids." },
          { status: 400 },
        );
      }
      ids = parsed.data.ids;
    }

    const { deleted, refused, notFound } = await deleteAdminQuestions(ids);

    if (deleted.length > 0) {
      await recordAudit({
        actorId: guard.actor.id,
        action: "question.delete",
        entity: "Question",
        entityId: deleted.length === 1 ? deleted[0] : null,
        summary: `Deleted ${deleted.length} question(s); refused ${refused.length} with dependents; ${notFound.length} not found`,
      });

      // The subject catalogue caches per-subject question counts.
      revalidateTag(CATALOGUE_TAG, "max");
    }

    return NextResponse.json({ deleted, refused, notFound });
  } catch (error) {
    console.error("Error deleting questions:", error);
    return NextResponse.json(
      { error: "Failed to delete questions" },
      { status: 500 }
    );
  }
}
