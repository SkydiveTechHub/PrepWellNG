import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { denyUnlessEntitled } from "@/lib/entitlements";
import { generateStudyPlanSchema } from "@/lib/validators";
import { generateStudyPlanFor, getActiveStudyPlan } from "@/lib/study-plan";

export const dynamic = "force-dynamic";

// GET /api/study-plan — get the active study plan with items
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // The study planner is a paid feature. Enforced server-side: hiding the
    // page does not stop a direct call to this route.
    const denied = await denyUnlessEntitled(session, "studyPlanner");
    if (denied) return denied;

    return NextResponse.json({ plan: await getActiveStudyPlan(session.user.id) });
  } catch (error) {
    console.error("Error fetching study plan:", error);
    return NextResponse.json(
      { error: "Failed to fetch study plan" },
      { status: 500 }
    );
  }
}

// POST /api/study-plan — generate a new study plan
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // The study planner is a paid feature. Enforced server-side: hiding the
    // page does not stop a direct call to this route.
    const denied = await denyUnlessEntitled(session, "studyPlanner");
    if (denied) return denied;

    const body = await req.json();
    const parsed = generateStudyPlanSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const result = await generateStudyPlanFor(session.user.id, parsed.data);
    if (result === "no-subjects") {
      return NextResponse.json({ error: "No valid subjects found" }, { status: 404 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error generating study plan:", error);
    return NextResponse.json(
      { error: "Failed to generate study plan" },
      { status: 500 }
    );
  }
}
