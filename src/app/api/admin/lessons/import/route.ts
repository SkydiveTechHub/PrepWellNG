import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { recordAudit } from "@/lib/admin-audit";
import { adminLessonImportSchema } from "@/lib/validators";
import { validateLessonMarkdown } from "@/lib/lesson-markdown";
import { importLesson } from "@/lib/admin-import-data";
import { revalidateTag } from "next/cache";
import { CATALOGUE_TAG } from "@/lib/catalogue";

export const dynamic = "force-dynamic";

// POST /api/admin/lessons/import — replace a topic's lesson from markdown.
export async function POST(req: NextRequest) {
  try {
    const guard = await requireAdmin();
    if (!guard.ok) return guard.response;

    const body = await req.json();
    const parsedBody = adminLessonImportSchema.safeParse(body);
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsedBody.error.flatten() },
        { status: 400 },
      );
    }
    const { topicId, markdown } = parsedBody.data;

    // The client parses only to render a preview. This parse is the one that
    // counts — trusting client-sent blocks would let a crafted request post
    // unsanitised SVG straight into student pages.
    const parsed = validateLessonMarkdown(markdown);
    if (parsed.errors.length > 0) {
      return NextResponse.json(
        { error: "This lesson has errors and was not saved", issues: parsed.errors },
        { status: 400 },
      );
    }

    const result = await importLesson(topicId, markdown, parsed, guard.actor.id);
    if (result.outcome === "unknown-topic") {
      return NextResponse.json({ error: "Unknown topic" }, { status: 404 });
    }

    await recordAudit({
      actorId: guard.actor.id,
      action: "lesson.import",
      entity: "Lesson",
      entityId: result.lessonId,
      summary: `${result.subjectName} — ${result.topicTitle}: ${result.blockCount} blocks from markdown`,
    });

    revalidateTag(CATALOGUE_TAG, "max");

    return NextResponse.json({
      message: `Saved ${result.blockCount} blocks to "${result.topicTitle}".`,
      lessonId: result.lessonId,
      blockCount: result.blockCount,
      warnings: parsed.warnings,
    });
  } catch (error) {
    console.error("Error importing lesson:", error);
    return NextResponse.json({ error: "Failed to import lesson" }, { status: 500 });
  }
}
