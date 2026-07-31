import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/questions/past-papers — list available past papers (grouped by exam/year/subject)
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const examType = searchParams.get("examType"); // WAEC | JAMB | NECO
    const subjectId = searchParams.get("subjectId");

    const where: Record<string, unknown> = {};
    if (examType) where.examType = examType;
    if (subjectId) where.subjectId = subjectId;

    // Group questions by examType + examYear + subject to get available papers
    const papers = await db.question.groupBy({
      by: ["examType", "examYear", "subjectId"],
      where: {
        ...where,
        examYear: { not: null },
      },
      _count: { id: true },
      orderBy: [
        { examYear: "desc" },
        { examType: "asc" },
      ],
    });

    // Fetch subject names for the results
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const subjectIds = [...new Set(papers.map((p: any) => p.subjectId))];
    const subjects = await db.subject.findMany({
      where: { id: { in: subjectIds } },
      select: { id: true, name: true, slug: true, trackCategory: true },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const subjectMap = Object.fromEntries(subjects.map((s: any) => [s.id, s]));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = papers.map((p: any) => ({
      examType: p.examType,
      examYear: p.examYear,
      subjectId: p.subjectId,
      subjectName: subjectMap[p.subjectId]?.name || "Unknown",
      subjectSlug: subjectMap[p.subjectId]?.slug || "",
      // Lets the practice flow show a student their own track's subjects first.
      trackCategory: subjectMap[p.subjectId]?.trackCategory || "CORE",
      questionCount: p._count.id,
    }));

    return NextResponse.json({ papers: result });
  } catch (error) {
    console.error("Error fetching past papers:", error);
    return NextResponse.json(
      { error: "Failed to fetch past papers" },
      { status: 500 }
    );
  }
}
