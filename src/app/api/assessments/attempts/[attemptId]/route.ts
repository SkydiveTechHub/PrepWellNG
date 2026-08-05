import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { buildAttemptResult } from "@/lib/attempt-results";

export const dynamic = "force-dynamic";

// GET /api/assessments/attempts/[attemptId] — fetch attempt results
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ attemptId: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { attemptId } = await params;
    const result = await buildAttemptResult(attemptId, session.user.id);

    if (!result) {
      return NextResponse.json({ error: "Attempt not found" }, { status: 404 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error fetching attempt:", error);
    return NextResponse.json(
      { error: "Failed to fetch results" },
      { status: 500 },
    );
  }
}
