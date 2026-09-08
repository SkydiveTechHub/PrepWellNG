import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { denyUnlessEntitled } from "@/lib/entitlements";
import { setDeckEnrollment } from "@/lib/flashcards";
import { toggleEnrollmentSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

// POST /api/flashcards/decks/[deckId]/enroll — subscribe or unsubscribe a deck.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ deckId: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Flashcards are a paid feature. Enforced here rather than only in the UI:
    // the hub being hidden does not stop a direct call to this route.
    const denied = await denyUnlessEntitled(session, "flashcards");
    if (denied) return denied;

    const { deckId } = await params;

    const body = await req.json();
    const parsed = toggleEnrollmentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { enrolled } = parsed.data;

    const result = await setDeckEnrollment(session.user.id, deckId, enrolled);
    if (result === "deck-not-found") {
      return NextResponse.json({ error: "Deck not found" }, { status: 404 });
    }

    return NextResponse.json({ deckId, enrolled });
  } catch (error) {
    console.error("Error toggling deck enrollment:", error);
    return NextResponse.json(
      { error: "Failed to update enrollment" },
      { status: 500 },
    );
  }
}
