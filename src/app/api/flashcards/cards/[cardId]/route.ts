import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { deleteFlashcard } from "@/lib/flashcards";

export const dynamic = "force-dynamic";

// DELETE /api/flashcards/cards/[cardId]
// Removes one card from a deck the student created. Their own review history
// for the card goes with it, and so does every enrolled student's — which is
// why this is owner-only rather than open to anyone studying the deck.
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ cardId: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { cardId } = await params;

    const result = await deleteFlashcard(session.user.id, cardId);
    if (result === "card-not-found") {
      return NextResponse.json({ error: "Card not found" }, { status: 404 });
    }
    if (result === "forbidden") {
      return NextResponse.json(
        { error: "Only the student who built this deck can remove its cards" },
        { status: 403 },
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error deleting flashcard:", error);
    return NextResponse.json(
      { error: "Failed to delete card" },
      { status: 500 },
    );
  }
}
