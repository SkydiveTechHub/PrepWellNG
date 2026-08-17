import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getFlashcardStatsFor } from "@/lib/flashcards";

export const dynamic = "force-dynamic";

// GET /api/flashcards/stats — the statistics dashboard payload.
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const stats = await getFlashcardStatsFor(session.user.id);
    return NextResponse.json({ stats });
  } catch (error) {
    console.error("Error fetching flashcard stats:", error);
    return NextResponse.json(
      { error: "Failed to fetch stats" },
      { status: 500 },
    );
  }
}
