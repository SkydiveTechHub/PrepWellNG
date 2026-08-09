import { db } from "./db";
import {
  getDeckSummaries,
  getFlashcardRecommendations,
  getFlashcardStats,
  getStudyQueue,
} from "./flashcard-analytics";
import { generateCardsFromLesson } from "./flashcard-content";
import {
  initialState,
  reviewCard,
  type ReviewRating,
  type ReviewState,
} from "./spaced-repetition";
import type { ReviewOutcome } from "@/types/flashcards";

/**
 * Page-level flashcard services.
 *
 * The functions in `flashcard-analytics` take their Prisma client as an
 * argument so they stay injectable; these bind the app's client so pages never
 * have to reach for it themselves.
 */

export type FlashcardsPageData = {
  decks: Awaited<ReturnType<typeof getDeckSummaries>>;
  recommendations: Awaited<ReturnType<typeof getFlashcardRecommendations>>;
  totalDue: number;
  totalFresh: number;
  /** Deck with the most cards due — the "start studying" target. */
  bestDeckId: string | null;
  decksWithDue: number;
  /** Finished lessons that can be turned into a deck. */
  lessons: { lessonId: string; title: string }[];
};

export async function getFlashcardsPageData(
  userId: string,
): Promise<FlashcardsPageData> {
  const [decks, recommendations, completedLessons] = await Promise.all([
    getDeckSummaries(db, userId),
    getFlashcardRecommendations(db, userId),
    db.studentProgress.findMany({
      where: { studentId: userId, status: "COMPLETED", lessonId: { not: null } },
      select: { lesson: { select: { id: true, title: true } } },
      orderBy: { lastAccessedAt: "desc" },
      take: 12,
    }),
  ]);

  const bestDeck =
    decks.length > 0 ? decks.reduce((a, b) => (b.due > a.due ? b : a)) : null;

  return {
    decks,
    recommendations,
    totalDue: decks.reduce((sum, d) => sum + d.due, 0),
    totalFresh: decks.reduce((sum, d) => sum + d.fresh, 0),
    bestDeckId: bestDeck?.id ?? null,
    decksWithDue: decks.filter((d) => d.due > 0).length,
    lessons: completedLessons
      .map((p) => p.lesson)
      .filter((l): l is { id: string; title: string } => l !== null)
      .map((l) => ({ lessonId: l.id, title: l.title })),
  };
}

export type DeckPageData = {
  deck: {
    id: string;
    title: string;
    description: string | null;
    subjectName: string | null;
    topicTitle: string | null;
  };
  queue: Awaited<ReturnType<typeof getStudyQueue>>;
};

/** A deck and its due queue, or null when the deck does not exist. */
export async function getDeckPageData(
  userId: string,
  deckId: string,
): Promise<DeckPageData | null> {
  const deck = await db.flashcardDeck.findUnique({
    where: { id: deckId },
    select: {
      id: true,
      title: true,
      description: true,
      subject: { select: { name: true } },
      topic: { select: { title: true } },
    },
  });
  if (!deck) return null;

  return {
    deck: {
      id: deck.id,
      title: deck.title,
      description: deck.description,
      subjectName: deck.subject?.name ?? null,
      topicTitle: deck.topic?.title ?? null,
    },
    queue: await getStudyQueue(db, userId, deckId),
  };
}

/** Retention, activity and leech statistics for the stats dashboard. */
export function getFlashcardStatsFor(userId: string) {
  return getFlashcardStats(db, userId);
}

/** Deck summaries for the hub — due / new / reviewed counts per deck. */
export function getDeckSummariesFor(userId: string) {
  return getDeckSummaries(db, userId);
}

/** Smart review suggestions for the hub. */
export function getFlashcardRecommendationsFor(userId: string) {
  return getFlashcardRecommendations(db, userId);
}

/** Creates a blank authored deck; cards are added separately via seeding. */
export function createFlashcardDeck(input: {
  createdBy: string;
  title: string;
  description?: string | null;
  subjectId?: string | null;
  topicId?: string | null;
}) {
  return db.flashcardDeck.create({
    data: {
      title: input.title,
      description: input.description,
      subjectId: input.subjectId,
      topicId: input.topicId,
      createdBy: input.createdBy,
      source: "AUTHORED",
    },
  });
}

/**
 * Subscribes or unsubscribes a student from a deck. Returns `"deck-not-found"`
 * for an unknown deck id.
 */
export async function setDeckEnrollment(
  studentId: string,
  deckId: string,
  enrolled: boolean,
) {
  const deck = await db.flashcardDeck.findUnique({
    where: { id: deckId },
    select: { id: true },
  });
  if (!deck) return "deck-not-found" as const;

  if (enrolled) {
    await db.flashcardEnrollment.upsert({
      where: { studentId_deckId: { studentId, deckId } },
      create: { studentId, deckId },
      update: {},
    });
  } else {
    await db.flashcardEnrollment.deleteMany({ where: { studentId, deckId } });
  }
  return "ok" as const;
}

/**
 * Converts a lesson's blocks into a shared deck (source: LESSON). Idempotent
 * per lesson via the @@unique([lessonId, source]) constraint — repeat calls
 * replace the existing deck's cards in place.
 *
 * `"lesson-not-found"` and `"no-cards"` are outcomes, not exceptions, so the
 * caller can map them to 404 and 422.
 */
export async function generateDeckFromLesson(userId: string, lessonId: string) {
  const lesson = await db.lesson.findUnique({
    where: { id: lessonId },
    include: {
      subtopic: { include: { topic: { select: { id: true, subjectId: true } } } },
    },
  });
  if (!lesson) return "lesson-not-found" as const;

  const generated = generateCardsFromLesson(lesson);
  if (generated.cards.length === 0) return "no-cards" as const;

  const subjectId = lesson.subtopic.topic.subjectId;
  const topicId = lesson.subtopic.topicId;

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
        subjectId,
        topicId,
        createdBy: userId,
      },
      update: {
        title: generated.title,
        description: generated.description,
        subjectId,
        topicId,
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

  return { deck, cardCount: generated.cards.length };
}

export type RecordReviewInput = {
  flashcardId: string;
  rating: ReviewRating;
  responseTimeMs?: number | null;
  objectiveCorrect?: boolean | null;
};

/**
 * Records one review: advances the SRS state via the engine, persists it on the
 * per-student FlashcardReview row, and writes an immutable FlashcardReviewLog.
 *
 * The card must belong to a deck this student authored or follows. Without that
 * check any authenticated user could post reviews against any card id, writing
 * SRS state for decks they had no relationship with.
 */
export async function recordFlashcardReview(
  studentId: string,
  input: RecordReviewInput,
) {
  const { flashcardId, rating, responseTimeMs, objectiveCorrect } = input;

  const flashcard = await db.flashcard.findFirst({
    where: {
      id: flashcardId,
      deck: {
        OR: [
          { createdBy: studentId },
          { enrollments: { some: { studentId } } },
        ],
      },
    },
    select: { id: true, difficulty: true },
  });
  if (!flashcard) return "flashcard-not-found" as const;

  const existing = await db.flashcardReview.findUnique({
    where: { studentId_flashcardId: { studentId, flashcardId } },
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

  const persisted = {
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
  };

  const [review] = await db.$transaction([
    db.flashcardReview.upsert({
      where: { studentId_flashcardId: { studentId, flashcardId } },
      create: { studentId, flashcardId, ...persisted },
      update: persisted,
    }),
    db.flashcardReviewLog.create({
      data: {
        studentId,
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

  return { outcome, review };
}
