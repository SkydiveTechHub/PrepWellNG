import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-guard";
import { parseBlocks } from "@/lib/lesson-engine";
import { isAuthored } from "@/lib/admin-lesson";

export const dynamic = "force-dynamic";

// GET /api/admin/lessons/[topicId] — what is currently stored, so the upload
// form can show the admin what they are about to replace.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ topicId: string }> },
) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { topicId } = await params;

  const topic = await db.topic.findUnique({
    where: { id: topicId },
    select: {
      title: true,
      subtopics: {
        orderBy: { orderIndex: "asc" },
        take: 1,
        select: {
          lessons: {
            take: 1,
            select: {
              title: true,
              blocks: true,
              content: true,
              createdBy: true,
              updatedAt: true,
            },
          },
        },
      },
    },
  });
  if (!topic) return NextResponse.json({ error: "Unknown topic" }, { status: 404 });

  const lesson = topic.subtopics[0]?.lessons[0] ?? null;
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
}
