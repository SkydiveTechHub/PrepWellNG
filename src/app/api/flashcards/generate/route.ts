import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { generateFlashcardDeckSchema } from "@/lib/validators";
import { generateCardsFromLesson } from "@/lib/flashcard-content";

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

    const { lessonId } = parsed.data;
    const userId = session.user.id;

    const lesson = await db.lesson.findUnique({
      where: { id: lessonId },
      include: {
        subtopic: { include: { topic: { select: { id: true, subjectId: true } } } },
      },
    });
    if (!lesson) {
      return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
    }

    const generated = generateCardsFromLesson(lesson);
    if (generated.cards.length === 0) {
      return NextResponse.json(
        { error: "Lesson has no cards to convert" },
        { status: 422 },
      );
    }

    const deck = await db.$transaction(async (tx) => {
      const existing = await tx.flashcardDeck.findUnique({
        where: { lessonId_source: { lessonId, source: "LESSON" } },
        select: { id: true },
      });

      if (existing) {
        await tx.flashcard.deleteMany({ where: { deckId: existing.id } });
      }

      const deckRow = await tx.flashcardDeck.upsert({
        where: { lessonId_source: { lessonId, source: "LESSON" } },
        create: {
          title: generated.title,
          description: generated.description,
          source: "LESSON",
          lessonId,
          subjectId: lesson.subtopic.topic.subjectId,
          topicId: lesson.subtopic.topicId,
          createdBy: userId,
        },
        update: {
          title: generated.title,
          description: generated.description,
          subjectId: lesson.subtopic.topic.subjectId,
          topicId: lesson.subtopic.topicId,
        },
      });

      await tx.flashcard.createMany({
        data: generated.cards.map((card, index) => ({
          deckId: deckRow.id,
          cardType: card.cardType,
          prompt: card.prompt,
          payload: card.payload as object,
          difficulty: card.difficulty,
          orderIndex: index,
        })),
      });

      return deckRow;
    });

    return NextResponse.json(
      { deck, cardCount: generated.cards.length },
      { status: 201 },
    );
  } catch (error) {
    console.error("Error generating flashcard deck:", error);
    return NextResponse.json(
      { error: "Failed to generate deck" },
      { status: 500 },
    );
  }
}
