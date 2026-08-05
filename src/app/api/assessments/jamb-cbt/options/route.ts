import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getJambSubjectOptions } from "@/lib/jamb-availability";
import { JAMB_SPEC } from "@/lib/jamb-cbt";

export const dynamic = "force-dynamic";

// GET /api/assessments/jamb-cbt/options
// Subjects the candidate can pick, and the years each one can actually cover.
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { english, englishYears, subjects } = await getJambSubjectOptions();

    return NextResponse.json({
      spec: JAMB_SPEC,
      english,
      // Surfaced so the picker can explain up front when the compulsory paper
      // is the thing blocking every combination.
      englishYears,
      subjects,
    });
  } catch (error) {
    console.error("Error loading JAMB CBT options:", error);
    return NextResponse.json(
      { error: "Failed to load subjects" },
      { status: 500 },
    );
  }
}
