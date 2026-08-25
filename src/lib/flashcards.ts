import { db } from "./db";
import {
  getDeckSummaries,
  getFlashcardRecommendations,
  getFlashcardStats,
  getStudyQueue,
} from "./flashcard-analytics";
import { generateCardsFromLesson } from "./flashcard-content";
import { diffDeck, diffCounts, type ExistingCard } from "./flashcard-diff";
import {
  initialState,
  reviewCard,
  type ReviewRating,
  type ReviewState,
} from "./spaced-repetition";
import type { ReviewOutcome } from "@/types/flashcards";

/**
 * A review grade as a 0..1 outcome for the SRS evidence channel. AGAIN is a
 * genuine failure to recall; EASY is effortless recall.
 */
const REVIEW_OUTCOME: Record<ReviewRating, number> = {
  AGAIN: 0,
  HARD: 0.5,
  GOOD: 0.85,
  EASY: 1,
};

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
 * Converts a lesson's blocks into a shared deck (source: LESSON), re-syncing in
 * place when the deck already exists.
 *
 * This deliberately does NOT delete and recreate. Deleting a Flashcard cascades
 * away every student's FlashcardReview and FlashcardReviewLog rows for it, and
 * lesson decks are shared — one student re-running the build used to reset the
 * whole cohort's memory state. Cards are matched to stored rows by the id of
 * the lesson block that produced them, so unchanged cards keep their schedule
 * and only a card whose block is genuinely gone is deleted.
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

  const result = await db.$transaction(async (tx) => {
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

    const existing: ExistingCard[] = await tx.flashcard.findMany({
      where: { deckId: deckRow.id },
      select: {
        id: true,
        sourceKey: true,
        orderIndex: true,
        cardType: true,
        prompt: true,
        payload: true,
        difficulty: true,
      },
    });

    const diff = diffDeck(existing, generated.cards);

    // Removals first: a deleted row frees its (deckId, sourceKey) slot before
    // any surviving card is written into it.
    if (diff.removed.length > 0) {
      await tx.flashcard.deleteMany({
        where: { id: { in: diff.removed.map((r) => r.id) } },
      });
    }

    for (const entry of diff.updated) {
      await tx.flashcard.update({
        where: { id: entry.id },
        data: {
          sourceKey: entry.card.sourceKey,
          cardType: entry.card.cardType,
          prompt: entry.card.prompt,
          payload: entry.card.payload as object,
          difficulty: entry.card.difficulty,
          orderIndex: entry.orderIndex,
        },
      });
    }

    // Unchanged cards keep their review state untouched; only position and a
    // missing key are ever written, and only when they actually differ.
    for (const entry of diff.unchanged) {
      if (!entry.needsWrite) continue;
      await tx.flashcard.update({
        where: { id: entry.id },
        data: { sourceKey: entry.card.sourceKey, orderIndex: entry.orderIndex },
      });
    }

    if (diff.created.length > 0) {
      await tx.flashcard.createMany({
        data: diff.created.map((entry) => ({
          deckId: deckRow.id,
          sourceKey: entry.card.sourceKey,
          cardType: entry.card.cardType,
          prompt: entry.card.prompt,
          payload: entry.card.payload as object,
          difficulty: entry.card.difficulty,
          orderIndex: entry.orderIndex,
        })),
      });
    }

    return { deck: deckRow, counts: diffCounts(diff) };
  });

  return { ...result, cardCount: generated.cards.length };
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
    select: {
      id: true,
      difficulty: true,
      deck: {
        select: {
          topicId: true,
          topic: { select: { subjectId: true } },
          lesson: {
            select: {
              subtopic: {
                select: { topic: { select: { id: true, subjectId: true } } },
              },
            },
          },
        },
      },
    },
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

  // A deck hangs off either a topic directly or a lesson's subtopic. Cards
  // with neither still record a review; they just carry no topic evidence.
  const deckTopic = flashcard.deck.lesson?.subtopic.topic ?? null;
  const topicId = flashcard.deck.topicId ?? deckTopic?.id ?? null;
  const subjectId = flashcard.deck.topic?.subjectId ?? deckTopic?.subjectId ?? null;

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
    ...(topicId && subjectId
      ? [
          db.learningEvent.createMany({
            data: [
              {
                studentId,
                subjectId,
                topicId,
                kind: "CARD_REVIEWED" as const,
                score: REVIEW_OUTCOME[rating],
                seconds: responseTimeMs ? Math.round(responseTimeMs / 1000) : null,
                sourceId: flashcardId,
                occurredAt: now,
              },
            ],
          }),
        ]
      : []),
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
