import { NextRequest, NextResponse, after } from "next/server";
import { auth } from "@/lib/auth";
import { denyUnlessEntitled } from "@/lib/entitlements";
import { submitFlashcardReviewSchema } from "@/lib/validators";
import { recordFlashcardReview } from "@/lib/flashcards";
import { markPlanFromCardReview } from "@/lib/study-plan-completion";

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

    // Flashcards are a paid feature. Enforced here rather than only in the UI:
    // the hub being hidden does not stop a direct call to this route.
    const denied = await denyUnlessEntitled(session, "flashcards");
    if (denied) return denied;

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

    const studentId = session.user.id;
    const { flashcardId } = parsed.data;
    // After the response: plan bookkeeping must not slow down the review loop.
    after(() => markPlanFromCardReview(studentId, flashcardId));

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error recording flashcard review:", error);
    return NextResponse.json(
      { error: "Failed to record review" },
      { status: 500 },
    );
  }
}
