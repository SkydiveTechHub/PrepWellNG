import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { submitFlashcardReviewSchema } from "@/lib/validators";
import { initialState, reviewCard, type ReviewState } from "@/lib/spaced-repetition";
import type { ReviewOutcome } from "@/types/flashcards";

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

    const { flashcardId, rating, responseTimeMs, objectiveCorrect } = parsed.data;

    const flashcard = await db.flashcard.findUnique({
      where: { id: flashcardId },
      select: { id: true, difficulty: true },
    });
    if (!flashcard) {
      return NextResponse.json({ error: "Flashcard not found" }, { status: 404 });
    }

    const existing = await db.flashcardReview.findUnique({
      where: {
        studentId_flashcardId: {
          studentId: session.user.id,
          flashcardId,
        },
      },
    });

    const now = new Date();
    const prior: ReviewState = existing
      ? {
          state: existing.state,
          stability: existing.stability,
          difficulty: existing.difficulty,
          easeFactor: existing.easeFactor,
          intervalDays: existing.intervalDays,
          repetitions: existing.repetitions,
          lapses: existing.lapses,
          retention: existing.retention,
          dueAt: existing.dueAt.toISOString(),
          lastReviewedAt: existing.lastReviewedAt?.toISOString() ?? null,
        }
      : initialState(flashcard.difficulty, now);

    const next = reviewCard(prior, { rating, reviewedAt: now });

    const review = await db.$transaction([
      db.flashcardReview.upsert({
        where: {
          studentId_flashcardId: {
            studentId: session.user.id,
            flashcardId,
          },
        },
        create: {
          studentId: session.user.id,
          flashcardId,
          state: next.state,
          easeFactor: next.easeFactor,
          stability: next.stability,
          difficulty: next.difficulty,
          intervalDays: next.intervalDays,
          repetitions: next.repetitions,
          lapses: next.lapses,
          retention: next.retention,
          dueAt: new Date(next.dueAt),
          lastReviewedAt: new Date(next.lastReviewedAt ?? now),
        },
        update: {
          state: next.state,
          easeFactor: next.easeFactor,
          stability: next.stability,
          difficulty: next.difficulty,
          intervalDays: next.intervalDays,
          repetitions: next.repetitions,
          lapses: next.lapses,
          retention: next.retention,
          dueAt: new Date(next.dueAt),
          lastReviewedAt: new Date(next.lastReviewedAt ?? now),
        },
      }),
      db.flashcardReviewLog.create({
        data: {
          studentId: session.user.id,
          flashcardId,
          rating,
          responseTimeMs: responseTimeMs ?? null,
          scheduledDays: next.intervalDays,
          objectiveCorrect: objectiveCorrect ?? null,
          reviewedAt: now,
        },
      }),
    ]);

    const outcome: ReviewOutcome = {
      cardId: flashcardId,
      rating,
      state: next.state,
      intervalDays: next.intervalDays,
      retention: next.retention,
      dueAt: next.dueAt,
    };

    return NextResponse.json({ outcome, review: review[0] });
  } catch (error) {
    console.error("Error recording flashcard review:", error);
    return NextResponse.json(
      { error: "Failed to record review" },
      { status: 500 },
    );
  }
}
