import { NextRequest, NextResponse } from "next/server";
import { listPastPapers } from "@/lib/questions";

export const dynamic = "force-dynamic";

// GET /api/questions/past-papers — list available past papers (grouped by exam/year/subject)
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const papers = await listPastPapers({
      examType: searchParams.get("examType"), // WAEC | JAMB | NECO
      subjectId: searchParams.get("subjectId"),
    });

    return NextResponse.json({ papers });
  } catch (error) {
    console.error("Error fetching past papers:", error);
    return NextResponse.json(
      { error: "Failed to fetch past papers" },
      { status: 500 }
    );
  }
}
