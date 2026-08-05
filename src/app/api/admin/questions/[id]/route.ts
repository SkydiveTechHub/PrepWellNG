import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-guard";
import { recordAudit } from "@/lib/admin-audit";
import { adminQuestionUpdateSchema } from "@/lib/validators";
import {
  checkQuestionInvariants,
  checkTopicOwnership,
  normalizeOptions,
} from "@/lib/admin-question";
import { revalidateTag } from "next/cache";
import { CATALOGUE_TAG } from "@/lib/catalogue";

export const dynamic = "force-dynamic";

// GET /api/admin/questions/[id] — single question for the edit form
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const guard = await requireAdmin();
    if (!guard.ok) return guard.response;

    const { id } = await params;

    const question = await db.question.findUnique({
      where: { id },
      include: {
        subject: { select: { id: true, name: true, code: true } },
        topic: { select: { id: true, title: true } },
      },
    });
    if (!question) {
      return NextResponse.json({ error: "Question not found" }, { status: 404 });
    }

    return NextResponse.json(question);
  } catch (error) {
    console.error("Error loading question:", error);
    return NextResponse.json({ error: "Failed to load question" }, { status: 500 });
  }
}

// PATCH /api/admin/questions/[id] — partial update.
// The invariants must be checked against the record MERGED with the patch,
// not the patch alone — a patch that rewrites `options` without resending
// `correctAnswer` would otherwise pass validation and leave a question whose
// correct answer is no longer one of its options.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const guard = await requireAdmin();
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

    const existing = await db.question.findUnique({
      where: { id },
      select: {
        id: true,
        subjectId: true,
        topicId: true,
        questionType: true,
        options: true,
        correctAnswer: true,
      },
    });
    if (!existing) {
      return NextResponse.json({ error: "Question not found" }, { status: 404 });
    }

    // Merge before checking: the patch is partial, the invariants are not.
    const mergedType = patch.questionType ?? existing.questionType;
    const mergedOptions =
      patch.options !== undefined
        ? (patch.options ?? null)
        : ((existing.options as Record<string, string> | null) ?? null);
    const mergedAnswer = patch.correctAnswer ?? existing.correctAnswer;
    const mergedSubjectId = patch.subjectId ?? existing.subjectId;
    const mergedTopicId =
      patch.topicId !== undefined ? (patch.topicId ?? null) : existing.topicId;

    const issues = checkQuestionInvariants({
      questionType: mergedType,
      options: mergedOptions,
      correctAnswer: mergedAnswer,
    });
    if (issues.length > 0) {
      return NextResponse.json(
        { error: issues[0].message, field: issues[0].field, issues },
        { status: 400 },
      );
    }

    // Only re-check ownership when either side of the pair moved.
    if (patch.subjectId !== undefined || patch.topicId !== undefined) {
      const topic = mergedTopicId
        ? await db.topic.findUnique({
            where: { id: mergedTopicId },
            select: { subjectId: true },
          })
        : null;
      const ownership = checkTopicOwnership({
        topicRef: mergedTopicId,
        topicSubjectId: topic?.subjectId ?? null,
        subjectId: mergedSubjectId,
      });
      if (ownership) {
        return NextResponse.json(
          { error: ownership.message, field: ownership.field },
          { status: 400 },
        );
      }
    }

    const { options: normalizedOptions } = normalizeOptions(mergedOptions);

    await db.question.update({
      where: { id },
      data: {
        ...patch,
        // Nulls on these two columns need explicit handling rather than the
        // spread's undefined-vs-null ambiguity.
        options:
          patch.options !== undefined
            ? (normalizedOptions ?? Prisma.DbNull)
            : undefined,
        correctAnswer:
          patch.correctAnswer !== undefined
            ? patch.correctAnswer.trim().toUpperCase()
            : undefined,
      },
    });

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
