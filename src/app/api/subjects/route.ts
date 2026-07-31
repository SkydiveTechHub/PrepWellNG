import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/subjects — list all subjects, optionally filtered
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const track = searchParams.get("track"); // SCIENCE | ARTS | COMMERCIAL
    const examType = searchParams.get("examType"); // waec | jamb | neco

    const where: Record<string, unknown> = {};
    if (track) where.trackCategory = track;
    if (examType === "waec") where.isWaec = true;
    if (examType === "jamb") where.isJamb = true;
    if (examType === "neco") where.isNeco = true;

    const subjects = await db.subject.findMany({
      where,
      orderBy: [{ trackCategory: "asc" }, { name: "asc" }],
      include: {
        _count: {
          select: {
            topics: true,
            questions: true,
          },
        },
      },
    });

    return NextResponse.json({ subjects });
  } catch (error) {
    console.error("Error fetching subjects:", error);
    return NextResponse.json(
      { error: "Failed to fetch subjects" },
      { status: 500 }
    );
  }
}
