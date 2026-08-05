import { NextRequest, NextResponse } from "next/server";
import { getSubjects } from "@/lib/catalogue";

export const dynamic = "force-dynamic";

// GET /api/subjects — list subjects, optionally filtered by track or exam board.
// The underlying catalogue is cached; only the filtering is per-request.
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const subjects = await getSubjects({
      track: searchParams.get("track"),
      examType: searchParams.get("examType"),
    });

    return NextResponse.json({ subjects });
  } catch (error) {
    console.error("Error fetching subjects:", error);
    return NextResponse.json(
      { error: "Failed to fetch subjects" },
      { status: 500 },
    );
  }
}
