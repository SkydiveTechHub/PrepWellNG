import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { denyUnlessEntitled } from "@/lib/entitlements";
import { getFlashcardStatsFor } from "@/lib/flashcards";

export const dynamic = "force-dynamic";

// GET /api/flashcards/stats — the statistics dashboard payload.
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Flashcards are a paid feature. Enforced here rather than only in the UI:
    // the hub being hidden does not stop a direct call to this route.
    const denied = await denyUnlessEntitled(session, "flashcards");
    if (denied) return denied;

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
