import { NextRequest, NextResponse } from "next/server";
import { requireStudyPlanner } from "@/lib/study-plan-route";
import { studyPlanPositionsSchema } from "@/lib/validators";
import { setClassPositions } from "@/lib/study-plan";

export const dynamic = "force-dynamic";

// PUT /api/study-plan/positions — "my class is on topic X" per subject; null follows the calendar
export async function PUT(req: NextRequest) {
  try {
    const g = await requireStudyPlanner();
    if (!g.ok) return g.response;

    const parsed = studyPlanPositionsSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const result = await setClassPositions(g.userId, parsed.data.positions);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error saving class positions:", error);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
}
