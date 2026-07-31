import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/questions — list/filter questions
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const subjectId = searchParams.get("subjectId");
    const topicId = searchParams.get("topicId");
    const examType = searchParams.get("examType");
    const examYear = searchParams.get("examYear");
    const difficulty = searchParams.get("difficulty");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);

    // Build filter
    const where: Record<string, unknown> = {};
    if (subjectId) where.subjectId = subjectId;
    if (topicId) where.topicId = topicId;
    if (examType) where.examType = examType;
    if (examYear) where.examYear = parseInt(examYear);
    if (difficulty) where.difficulty = difficulty;

    const [questions, total] = await Promise.all([
      db.question.findMany({
        where,
        include: {
          subject: { select: { id: true, name: true, slug: true } },
          topic: { select: { id: true, title: true, slug: true } },
        },
        orderBy: [
          { examYear: "desc" },
          { questionNumber: "asc" },
        ],
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.question.count({ where }),
    ]);

    return NextResponse.json({
      questions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching questions:", error);
    return NextResponse.json(
      { error: "Failed to fetch questions" },
      { status: 500 }
    );
  }
}
