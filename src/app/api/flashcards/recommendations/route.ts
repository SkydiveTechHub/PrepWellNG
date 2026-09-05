import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { denyUnlessEntitled } from "@/lib/entitlements";
import { getFlashcardRecommendationsFor } from "@/lib/flashcards";

export const dynamic = "force-dynamic";

// GET /api/flashcards/recommendations — the smart review suggestions.
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

    const recommendations = await getFlashcardRecommendationsFor(session.user.id);
    return NextResponse.json({ recommendations });
  } catch (error) {
    console.error("Error fetching flashcard recommendations:", error);
    return NextResponse.json(
      { error: "Failed to fetch recommendations" },
      { status: 500 },
    );
  }
}
