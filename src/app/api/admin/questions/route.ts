import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-guard";
import { recordAudit } from "@/lib/admin-audit";
import {
  adminQuestionCreateSchema,
  adminQuestionDeleteSchema,
} from "@/lib/validators";
import { checkTopicOwnership, normalizeOptions } from "@/lib/admin-question";
import { revalidateTag } from "next/cache";
import { CATALOGUE_TAG } from "@/lib/catalogue";

export const dynamic = "force-dynamic";

// GET /api/admin/questions — list/search questions (admin)
export async function GET(req: NextRequest) {
  try {
    const guard = await requireAdmin();
    if (!guard.ok) return guard.response;

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") || "20")));
    const subjectId = searchParams.get("subjectId");
    const examType = searchParams.get("examType");
    const examYear = searchParams.get("examYear");
    const difficulty = searchParams.get("difficulty");
    const search = searchParams.get("search");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: Record<string, any> = {};
    if (subjectId) where.subjectId = subjectId;
    if (examType) where.examType = examType;
    if (examYear) where.examYear = parseInt(examYear);
    if (difficulty) where.difficulty = difficulty;
    if (search) {
      where.questionText = { contains: search, mode: "insensitive" };
    }

    const [questions, total] = await Promise.all([
      db.question.findMany({
        where,
        include: {
          subject: { select: { name: true, code: true } },
          topic: { select: { title: true, slug: true } },
        },
        orderBy: [
          { examType: "asc" },
          { examYear: "desc" },
          { questionNumber: "asc" },
        ],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.question.count({ where }),
    ]);

    return NextResponse.json({
      questions,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    console.error("Error listing questions:", error);
    return NextResponse.json(
      { error: "Failed to list questions" },
      { status: 500 }
    );
  }
}

// POST /api/admin/questions — create a question
export async function POST(req: NextRequest) {
  try {
    const guard = await requireAdmin();
    if (!guard.ok) return guard.response;

    const parsed = adminQuestionCreateSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const input = parsed.data;

    const subject = await db.subject.findUnique({
      where: { id: input.subjectId },
      select: { id: true, code: true },
    });
    if (!subject) {
      return NextResponse.json({ error: "Unknown subject" }, { status: 400 });
    }

    // The topic must hang off the chosen subject — the FK alone permits any
    // topic in the database.
    const topic = input.topicId
      ? await db.topic.findUnique({
          where: { id: input.topicId },
          select: { id: true, subjectId: true },
        })
      : null;
    const ownership = checkTopicOwnership({
      topicRef: input.topicId ?? null,
      topicSubjectId: topic?.subjectId ?? null,
      subjectId: input.subjectId,
    });
    if (ownership) {
      return NextResponse.json(
        { error: ownership.message, field: ownership.field },
        { status: 400 },
      );
    }

    const { options } = normalizeOptions(input.options);

    const created = await db.question.create({
      data: {
        subjectId: input.subjectId,
        topicId: input.topicId ?? null,
        examType: input.examType,
        examYear: input.examYear ?? null,
        questionNumber: input.questionNumber ?? null,
        questionText: input.questionText,
        questionImageUrl: input.questionImageUrl ?? null,
        questionType: input.questionType,
        // A bare null is a type error on a nullable Json column; Prisma needs
        // the DbNull sentinel (same reason as import/route.ts:139).
        options: options ?? Prisma.DbNull,
        correctAnswer: input.correctAnswer.trim().toUpperCase(),
        explanation: input.explanation,
        explanationImageUrl: input.explanationImageUrl ?? null,
        difficulty: input.difficulty,
        marks: input.marks,
        timeEstimateSeconds: input.timeEstimateSeconds,
      },
      select: { id: true },
    });

    await recordAudit({
      actorId: guard.actor.id,
      action: "question.create",
      entity: "Question",
      entityId: created.id,
      summary: `Created ${subject.code} ${input.examType} question`,
    });

    revalidateTag(CATALOGUE_TAG, "max");

    return NextResponse.json({ id: created.id }, { status: 201 });
  } catch (error) {
    console.error("Error creating question:", error);
    return NextResponse.json({ error: "Failed to create question" }, { status: 500 });
  }
}

// DELETE /api/admin/questions?id=xxx — delete a single question (compat) or
// DELETE /api/admin/questions with a JSON body of { ids } — bulk delete.
// Dependents (question responses and assessment slots) are counted first and
// refused explicitly rather than left to surface as an opaque FK-restrict 500.
export async function DELETE(req: NextRequest) {
  try {
    const guard = await requireAdmin();
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

    // Count dependents in two grouped queries rather than one per id.
    const [responses, assessments] = await Promise.all([
      db.questionResponse.groupBy({
        by: ["questionId"],
        where: { questionId: { in: ids } },
        _count: { questionId: true },
      }),
      db.assessmentQuestion.groupBy({
        by: ["questionId"],
        where: { questionId: { in: ids } },
        _count: { questionId: true },
      }),
    ]);

    const responseCounts = new Map(
      responses.map((r) => [r.questionId, r._count.questionId]),
    );
    const assessmentCounts = new Map(
      assessments.map((r) => [r.questionId, r._count.questionId]),
    );

    const refused = ids
      .map((id) => ({
        id,
        responseCount: responseCounts.get(id) ?? 0,
        assessmentCount: assessmentCounts.get(id) ?? 0,
      }))
      .filter((row) => row.responseCount > 0 || row.assessmentCount > 0);

    const refusedIds = new Set(refused.map((r) => r.id));
    const deletable = ids.filter((id) => !refusedIds.has(id));

    if (deletable.length > 0) {
      await db.question.deleteMany({ where: { id: { in: deletable } } });

      await recordAudit({
        actorId: guard.actor.id,
        action: "question.delete",
        entity: "Question",
        entityId: deletable.length === 1 ? deletable[0] : null,
        summary: `Deleted ${deletable.length} question(s); refused ${refused.length} with dependents`,
      });

      // The subject catalogue caches per-subject question counts.
      revalidateTag(CATALOGUE_TAG, "max");
    }

    return NextResponse.json({ deleted: deletable, refused });
  } catch (error) {
    console.error("Error deleting questions:", error);
    return NextResponse.json(
      { error: "Failed to delete questions" },
      { status: 500 }
    );
  }
}
