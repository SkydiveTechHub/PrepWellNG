import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-guard";
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

// DELETE /api/admin/questions?id=xxx — delete a single question
export async function DELETE(req: NextRequest) {
  try {
    const guard = await requireAdmin();
    if (!guard.ok) return guard.response;

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Question ID required" }, { status: 400 });
    }

    await db.question.delete({ where: { id } });

    // The subject catalogue caches per-subject question counts.
    revalidateTag(CATALOGUE_TAG, "max");

    return NextResponse.json({ message: "Question deleted" });
  } catch (error) {
    console.error("Error deleting question:", error);
    return NextResponse.json(
      { error: "Failed to delete question" },
      { status: 500 }
    );
  }
}
