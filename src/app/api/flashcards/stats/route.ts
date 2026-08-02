import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { getFlashcardStats } from "@/lib/flashcard-analytics";

export const dynamic = "force-dynamic";

// GET /api/flashcards/stats — the statistics dashboard payload.
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const stats = await getFlashcardStats(db, session.user.id);
    return NextResponse.json({ stats });
  } catch (error) {
    console.error("Error fetching flashcard stats:", error);
    return NextResponse.json(
      { error: "Failed to fetch stats" },
      { status: 500 },
    );
  }
}
