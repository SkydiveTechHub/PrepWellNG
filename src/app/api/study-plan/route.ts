import { NextRequest, NextResponse } from "next/server";
import { requireStudyPlanner } from "@/lib/study-plan-route";
import { studyPlanSettingsSchema } from "@/lib/validators";
import { createStudyPlan, getStudyPlanPageData, updateStudyPlanSettings } from "@/lib/study-plan";

export const dynamic = "force-dynamic";

// GET /api/study-plan — the plan page payload (re-plans first if stale)
export async function GET() {
  try {
    const g = await requireStudyPlanner();
    if (!g.ok) return g.response;
    return NextResponse.json(await getStudyPlanPageData(g.userId));
  } catch (error) {
    console.error("Error fetching study plan:", error);
    return NextResponse.json({ error: "Failed to fetch study plan" }, { status: 500 });
  }
}

// POST /api/study-plan — create a plan, retiring the active one
export async function POST(req: NextRequest) {
  try {
    const g = await requireStudyPlanner();
    if (!g.ok) return g.response;

    const parsed = studyPlanSettingsSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const result = await createStudyPlan(g.userId, parsed.data);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ planId: result.planId }, { status: 201 });
  } catch (error) {
    console.error("Error creating study plan:", error);
    return NextResponse.json({ error: "Failed to create study plan" }, { status: 500 });
  }
}

// PATCH /api/study-plan — change the active plan's settings and re-plan
export async function PATCH(req: NextRequest) {
  try {
    const g = await requireStudyPlanner();
    if (!g.ok) return g.response;

    const parsed = studyPlanSettingsSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const result = await updateStudyPlanSettings(g.userId, parsed.data);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error updating study plan:", error);
    return NextResponse.json({ error: "Failed to update study plan" }, { status: 500 });
  }
}
