import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-guard";
import { recordAudit } from "@/lib/admin-audit";
import { adminLessonImportSchema } from "@/lib/validators";
import { validateLessonMarkdown } from "@/lib/lesson-markdown";
import { buildLessonUpdate } from "@/lib/admin-lesson";
import { resolveTopicLesson, topicLessonSelectWith } from "@/lib/classroom";
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

    const topic = await db.topic.findUnique({
      where: { id: topicId },
      select: {
        id: true,
        title: true,
        subject: { select: { name: true } },
        // Canonical fragment. This route is the one place that can create a
        // *second* lesson under an existing subtopic, so it is the reason the
        // ordering matters at all: resolving the overwrite target by database
        // order would let an admin overwrite a lesson the Classroom (which
        // orders by `createdAt`) never renders.
        subtopics: topicLessonSelectWith({ id: true }, { id: true }),
      },
    });
    if (!topic) {
      return NextResponse.json({ error: "Unknown topic" }, { status: 404 });
    }

    const update = buildLessonUpdate(parsed, markdown, guard.actor.id);
    // `blocks` is a Json column. Prisma types it as InputJsonValue, which a
    // LessonBlock[] does not structurally satisfy (optional fields typed as
    // `T | undefined`), so the cast is required — not laziness.
    const blocksJson = update.blocks as unknown as Prisma.InputJsonValue;

    // A topic with no subtopic or lesson yet is not an error — a newly added
    // topic must be authorable without running the seed first.
    let subtopicId = topic.subtopics[0]?.id;
    if (!subtopicId) {
      const created = await db.subtopic.create({
        data: { topicId: topic.id, title: "Core Concepts", orderIndex: 0 },
        select: { id: true },
      });
      subtopicId = created.id;
    }

    const lessonId = resolveTopicLesson(topic)?.id;
    const lesson = lessonId
      ? await db.lesson.update({
          where: { id: lessonId },
          data: { ...update, blocks: blocksJson },
          select: { id: true },
        })
      : await db.lesson.create({
          data: {
            subtopicId,
            title: update.title ?? topic.title,
            content: update.content,
            blocks: blocksJson,
            createdBy: update.createdBy,
            summary: update.summary,
            estimatedMinutes: update.estimatedMinutes,
            difficulty: update.difficulty,
            passMarkPercent: update.passMarkPercent,
            practiceCount: update.practiceCount,
          },
          select: { id: true },
        });

    await recordAudit({
      actorId: guard.actor.id,
      action: "lesson.import",
      entity: "Lesson",
      entityId: lesson.id,
      summary: `${topic.subject.name} — ${topic.title}: ${parsed.blocks.length} blocks from markdown`,
    });

    revalidateTag(CATALOGUE_TAG, "max");

    return NextResponse.json({
      message: `Saved ${parsed.blocks.length} blocks to "${topic.title}".`,
      lessonId: lesson.id,
      blockCount: parsed.blocks.length,
      warnings: parsed.warnings,
    });
  } catch (error) {
    console.error("Error importing lesson:", error);
    return NextResponse.json({ error: "Failed to import lesson" }, { status: 500 });
  }
}
