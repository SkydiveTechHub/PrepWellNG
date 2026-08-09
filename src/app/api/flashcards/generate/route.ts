import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { generateFlashcardDeckSchema } from "@/lib/validators";
import { generateDeckFromLesson } from "@/lib/flashcards";

export const dynamic = "force-dynamic";

// POST /api/flashcards/generate
// Converts a lesson's blocks into a shared deck (source: LESSON). Idempotent per
// lesson via the @@unique([lessonId, source]) constraint — repeat calls update
// the existing deck's cards in place.
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const parsed = generateFlashcardDeckSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const result = await generateDeckFromLesson(
      session.user.id,
      parsed.data.lessonId,
    );

    if (result === "lesson-not-found") {
      return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
    }
    if (result === "no-cards") {
      return NextResponse.json(
        { error: "Lesson has no cards to convert" },
        { status: 422 },
      );
    }

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error("Error generating flashcard deck:", error);
    return NextResponse.json(
      { error: "Failed to generate deck" },
      { status: 500 },
    );
  }
}
