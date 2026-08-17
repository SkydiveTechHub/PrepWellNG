import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { awardAchievements, getAchievementsApiPayload } from "@/lib/achievements";

export const dynamic = "force-dynamic";

// GET /api/achievements — the full catalogue, flagged with what this user earned
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json(await getAchievementsApiPayload(session.user.id));
  } catch (error) {
    console.error("Error fetching achievements:", error);
    return NextResponse.json(
      { error: "Failed to fetch achievements" },
      { status: 500 },
    );
  }
}

// POST /api/achievements — re-check criteria and award anything newly qualifying
export async function POST() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const newlyEarned = await awardAchievements(session.user.id);

    return NextResponse.json({
      checked: true,
      newlyEarned,
      count: newlyEarned.length,
    });
  } catch (error) {
    console.error("Error checking achievements:", error);
    return NextResponse.json(
      { error: "Failed to check achievements" },
      { status: 500 },
    );
  }
}
