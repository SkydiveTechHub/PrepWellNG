import { NextRequest, NextResponse } from "next/server";
import { listQuestions } from "@/lib/questions";

export const dynamic = "force-dynamic";

// GET /api/questions — list/filter questions
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const page = parseInt(searchParams.get("page") || "1");
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);

    return NextResponse.json(
      await listQuestions(
        {
          subjectId: searchParams.get("subjectId"),
          topicId: searchParams.get("topicId"),
          examType: searchParams.get("examType"),
          examYear: searchParams.get("examYear"),
          difficulty: searchParams.get("difficulty"),
        },
        page,
        limit,
      ),
    );
  } catch (error) {
    console.error("Error fetching questions:", error);
    return NextResponse.json(
      { error: "Failed to fetch questions" },
      { status: 500 }
    );
  }
}
