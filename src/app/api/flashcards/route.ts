import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { denyUnlessEntitled } from "@/lib/entitlements";
import { createFlashcardDeck, getDeckSummariesFor } from "@/lib/flashcards";
import { createFlashcardDeckSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

// GET /api/flashcards — deck summaries for the hub (due/new/reviewed counts).
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

    const decks = await getDeckSummariesFor(session.user.id);
    return NextResponse.json({ decks });
  } catch (error) {
    console.error("Error fetching flashcards:", error);
    return NextResponse.json(
      { error: "Failed to fetch flashcards" },
      { status: 500 },
    );
  }
}

// POST /api/flashcards — create a blank authored deck (cards are added via seed).
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
    const parsed = createFlashcardDeckSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { title, description, subjectId, topicId } = parsed.data;
    const deck = await createFlashcardDeck({
      title,
      description,
      subjectId,
      topicId,
      createdBy: session.user.id,
    });

    return NextResponse.json({ deck }, { status: 201 });
  } catch (error) {
    console.error("Error creating flashcard deck:", error);
    return NextResponse.json(
      { error: "Failed to create deck" },
      { status: 500 },
    );
  }
}
