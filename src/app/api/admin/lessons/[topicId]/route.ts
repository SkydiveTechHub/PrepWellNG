import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-guard";
import { parseBlocks } from "@/lib/lesson-engine";
import { isAuthored } from "@/lib/admin-lesson";
import { resolveTopicLesson, topicLessonSelectWith } from "@/lib/classroom";

export const dynamic = "force-dynamic";

// GET /api/admin/lessons/[topicId] — what is currently stored, so the upload
// form can show the admin what they are about to replace.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ topicId: string }> },
) {
  // Wrapped like every sibling admin route (questions/route.ts,
  // questions/[id]/route.ts): an unhandled throw here would surface to the
  // upload form as an opaque failure with nothing in the server log.
  try {
    const guard = await requireAdmin();
    if (!guard.ok) return guard.response;

    const { topicId } = await params;

    const topic = await db.topic.findUnique({
      where: { id: topicId },
      select: {
        title: true,
        // Canonical fragment: the upload form must be told about the same
        // lesson the Classroom renders and the import route overwrites.
        subtopics: topicLessonSelectWith({
          title: true,
          blocks: true,
          content: true,
          createdBy: true,
          updatedAt: true,
        }),
      },
    });
    if (!topic) return NextResponse.json({ error: "Unknown topic" }, { status: 404 });

    const lesson = resolveTopicLesson(topic);
    return NextResponse.json({
      topicTitle: topic.title,
      lesson: lesson
        ? {
            title: lesson.title,
            blockCount: parseBlocks(lesson.blocks).length,
            authored: isAuthored(lesson.createdBy),
            updatedAt: lesson.updatedAt,
            markdown: isAuthored(lesson.createdBy) ? lesson.content : null,
          }
        : null,
    });
  } catch (error) {
    console.error("Error loading lesson for topic:", error);
    return NextResponse.json({ error: "Failed to load lesson" }, { status: 500 });
  }
}
