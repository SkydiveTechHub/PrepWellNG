import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { submitFlashcardReviewSchema } from "@/lib/validators";
import { recordFlashcardReview } from "@/lib/flashcards";

export const dynamic = "force-dynamic";

// POST /api/flashcards/review
// Records one review: advances the SRS state via the engine, persists it on the
// per-student FlashcardReview row, and writes an immutable FlashcardReviewLog.
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const parsed = submitFlashcardReviewSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const result = await recordFlashcardReview(session.user.id, parsed.data);
    if (result === "flashcard-not-found") {
      return NextResponse.json({ error: "Flashcard not found" }, { status: 404 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error recording flashcard review:", error);
    return NextResponse.json(
      { error: "Failed to record review" },
      { status: 500 },
    );
  }
}
