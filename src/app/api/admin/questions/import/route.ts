import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { recordAudit } from "@/lib/admin-audit";
import { bulkImportSchema } from "@/lib/validators";
import { importQuestions } from "@/lib/admin-import-data";
import { revalidateTag } from "next/cache";
import { CATALOGUE_TAG } from "@/lib/catalogue";

export const dynamic = "force-dynamic";

// POST /api/admin/questions/import — bulk import questions
export async function POST(req: NextRequest) {
  try {
    const guard = await requireAdmin();
    if (!guard.ok) return guard.response;

    const body = await req.json();
    const parsed = bulkImportSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { questions, skipDuplicates } = parsed.data;

    const results = await importQuestions(questions, skipDuplicates);

    await recordAudit({
      actorId: guard.actor.id,
      action: "question.import",
      entity: "Question",
      summary: `Imported ${results.imported}, skipped ${results.skipped}, ${results.errors.length} errors`,
    });

    // The subject catalogue caches per-subject question counts.
    if (results.imported > 0) revalidateTag(CATALOGUE_TAG, "max");

    return NextResponse.json({
      message: `Import complete: ${results.imported} imported, ${results.skipped} duplicates skipped, ${results.errors.length} errors`,
      ...results,
    });
  } catch (error) {
    console.error("Error importing questions:", error);
    return NextResponse.json(
      { error: "Failed to import questions" },
      { status: 500 }
    );
  }
}
