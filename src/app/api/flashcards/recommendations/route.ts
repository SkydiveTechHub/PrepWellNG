import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getFlashcardRecommendationsFor } from "@/lib/flashcards";

export const dynamic = "force-dynamic";

// GET /api/flashcards/recommendations — the smart review suggestions.
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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
