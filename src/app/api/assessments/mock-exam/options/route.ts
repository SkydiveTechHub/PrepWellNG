import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getMockExamAvailability } from "@/lib/mock-exam-availability";

export const dynamic = "force-dynamic";

const BOARDS = new Set(["WAEC", "JAMB", "NECO"]);

// GET /api/assessments/mock-exam/options?examType=WAEC
// Subjects sittable for a board, with per class/term question counts so the
// picker can grey out slots that hold nothing.
export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const examType = req.nextUrl.searchParams.get("examType") ?? "";
    if (!BOARDS.has(examType)) {
      return NextResponse.json(
        { error: "Choose WAEC, JAMB or NECO." },
        { status: 400 },
      );
    }

    const subjects = await getMockExamAvailability(examType);
    return NextResponse.json({ examType, subjects });
  } catch (error) {
    console.error("Error loading mock exam options:", error);
    return NextResponse.json(
      { error: "Failed to load subjects" },
      { status: 500 },
    );
  }
}
