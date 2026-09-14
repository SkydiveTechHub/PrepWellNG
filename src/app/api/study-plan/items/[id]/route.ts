import { NextRequest, NextResponse } from "next/server";
import { requireStudyPlanner } from "@/lib/study-plan-route";
import { studyPlanItemStatusSchema } from "@/lib/validators";
import { setPlanItemStatus } from "@/lib/study-plan";

export const dynamic = "force-dynamic";

// PATCH /api/study-plan/items/[id] — tick, skip or undo one session
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const g = await requireStudyPlanner();
    if (!g.ok) return g.response;
    const { id } = await params;

    const parsed = studyPlanItemStatusSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const result = await setPlanItemStatus(g.userId, id, parsed.data.status);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ status: result.status });
  } catch (error) {
    console.error("Error updating study plan session:", error);
    return NextResponse.json({ error: "Failed to update session" }, { status: 500 });
  }
}
