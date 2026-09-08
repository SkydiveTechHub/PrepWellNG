import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { denyUnlessEntitled } from "@/lib/entitlements";
import { deleteDeck } from "@/lib/flashcards";

export const dynamic = "force-dynamic";

// DELETE /api/flashcards/decks/[deckId]
// Removes a deck the student created, and every card in it. The creator is not
// enrolled in their own deck, so there is no unfollow to fall back on: taking
// it off their list means deleting it. A lesson deck can be rebuilt from the
// lesson afterwards; the review history cannot.
export async function DELETE(
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

    const result = await deleteDeck(session.user.id, deckId);
    if (result === "deck-not-found") {
      return NextResponse.json({ error: "Deck not found" }, { status: 404 });
    }
    if (result === "forbidden") {
      return NextResponse.json(
        { error: "Only the student who built this deck can delete it" },
        { status: 403 },
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error deleting flashcard deck:", error);
    return NextResponse.json(
      { error: "Failed to delete deck" },
      { status: 500 },
    );
  }
}
