import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
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

    const { deckId } = await params;

    const deck = await db.flashcardDeck.findUnique({
      where: { id: deckId },
      select: { id: true },
    });
    if (!deck) {
      return NextResponse.json({ error: "Deck not found" }, { status: 404 });
    }

    const body = await req.json();
    const parsed = toggleEnrollmentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { enrolled } = parsed.data;

    if (enrolled) {
      await db.flashcardEnrollment.upsert({
        where: { studentId_deckId: { studentId: session.user.id, deckId } },
        create: { studentId: session.user.id, deckId },
        update: {},
      });
    } else {
      await db.flashcardEnrollment.deleteMany({
        where: { studentId: session.user.id, deckId },
      });
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
