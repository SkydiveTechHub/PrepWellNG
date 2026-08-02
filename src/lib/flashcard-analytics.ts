// Flashcard analytics: study statistics and smart recommendations.
// Query layer over the review state + the existing performance tables.
// See docs/superpowers/specs/2026-08-01-flashcards-design.md.

import type { PrismaClient } from "@prisma/client";
import { predictRetention } from "./spaced-repetition";
import type {
  ActivityPoint,
  DeckStat,
  DeckSummary,
  FlashcardRecommendation,
  FlashcardStats,
  StudyCardState,
} from "@/types/flashcards";

const DAY_MS = 86_400_000;

type RetentionLog = { rating: "AGAIN" | "HARD" | "GOOD" | "EASY"; objectiveCorrect: boolean | null };

/** Success signal for a review: the objective self-check when present, else the rating. */
function wasSuccessful(log: RetentionLog): boolean {
  if (log.objectiveCorrect != null) return log.objectiveCorrect;
  return log.rating === "GOOD" || log.rating === "EASY";
}

function startOfDay(at = new Date()): Date {
  const d = new Date(at);
  d.setHours(0, 0, 0, 0);
  return d;
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Prisma groupBy `_count` can be `true | { … } | undefined` — read it defensively. */
function groupCount<T extends { _count: unknown }>(row: T): number {
  const count = row._count;
  if (typeof count !== "object" || count === null) return 0;
  const c = count as { id?: number; _all?: number };
  return c.id ?? c._all ?? 0;
}

// ─── Deck summaries (hub) ───────────────────────────────────

export async function getDeckSummaries(
  db: PrismaClient,
  studentId: string,
): Promise<DeckSummary[]> {
  const now = new Date();
  const [decks, reviews, enrollments, cardCounts] = await db.$transaction([
    db.flashcardDeck.findMany({
      include: {
        subject: { select: { name: true } },
        topic: { select: { title: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    db.flashcardReview.findMany({
      where: { studentId },
      select: {
        flashcardId: true,
        dueAt: true,
        lastReviewedAt: true,
        flashcard: { select: { deckId: true } },
      },
    }),
    db.flashcardEnrollment.findMany({
      where: { studentId },
      select: { deckId: true },
    }),
    db.flashcard.groupBy({ by: ["deckId"], _count: { id: true }, orderBy: { deckId: "asc" } }),
  ]);

  const enrolled = new Set(enrollments.map((e) => e.deckId));
  const totalByDeck = new Map(cardCounts.map((c) => [c.deckId, groupCount(c)]));
  const lastByDeck = new Map<string, number>();
  const dueByDeck = new Map<string, number>();
  const reviewedByDeck = new Map<string, number>();

  for (const review of reviews) {
    const deckId = review.flashcard.deckId;
    reviewedByDeck.set(deckId, (reviewedByDeck.get(deckId) ?? 0) + 1);
    if (review.dueAt.getTime() <= now.getTime()) {
      dueByDeck.set(deckId, (dueByDeck.get(deckId) ?? 0) + 1);
    }
    const t = review.lastReviewedAt?.getTime() ?? 0;
    if (t > (lastByDeck.get(deckId) ?? 0)) lastByDeck.set(deckId, t);
  }

  return decks.map((deck) => {
    const total = totalByDeck.get(deck.id) ?? 0;
    const reviewed = reviewedByDeck.get(deck.id) ?? 0;
    const due = dueByDeck.get(deck.id) ?? 0;
    const last = lastByDeck.get(deck.id);
    return {
      id: deck.id,
      title: deck.title,
      description: deck.description,
      source: deck.source,
      subjectName: deck.subject?.name ?? null,
      topicTitle: deck.topic?.title ?? null,
      totalCards: total,
      due,
      fresh: total - reviewed,
      reviewed,
      enrolled: enrolled.has(deck.id),
      lastReviewedAt: last ? new Date(last).toISOString() : null,
    };
  });
}

// ─── Statistics ─────────────────────────────────────────────

export async function getFlashcardStats(
  db: PrismaClient,
  studentId: string,
): Promise<FlashcardStats> {
  const now = new Date();
  const dayStart = startOfDay(now);
  const monthAgo = new Date(now.getTime() - 30 * DAY_MS);
  const weekAgo = new Date(now.getTime() - 7 * DAY_MS);
  const activityStart = new Date(now.getTime() - 13 * DAY_MS);

  const [logCount, todayLogs, monthLogs, reviewRows, deckList, cardCounts, leechLogs] =
    await db.$transaction([
      db.flashcardReviewLog.count({ where: { studentId } }),
      db.flashcardReviewLog.findMany({
        where: { studentId, reviewedAt: { gte: dayStart } },
        select: { id: true },
      }),
      db.flashcardReviewLog.findMany({
        where: { studentId, reviewedAt: { gte: monthAgo } },
        select: { rating: true, responseTimeMs: true, reviewedAt: true, objectiveCorrect: true },
      }),
      db.flashcardReview.findMany({
        where: { studentId },
        select: {
          flashcardId: true,
          dueAt: true,
          state: true,
          stability: true,
          intervalDays: true,
          lapses: true,
          lastReviewedAt: true,
          difficulty: true,
          updatedAt: true,
          flashcard: { select: { deckId: true } },
        },
      }),
      db.flashcardDeck.findMany({ select: { id: true, title: true } }),
      db.flashcard.groupBy({ by: ["deckId"], _count: { id: true }, orderBy: { deckId: "asc" } }),
      db.flashcardReviewLog.findMany({
        where: { studentId, reviewedAt: { gte: new Date(now.getTime() - 90 * DAY_MS) } },
        select: { flashcardId: true, rating: true },
      }),
    ]);

  const cardPrompts = await db.flashcard.findMany({
    where: {
      id: { in: [...new Set(reviewRows.map((r) => r.flashcardId))] },
    },
    select: { id: true, prompt: true },
  });

  const reviewCountByCard = new Map<string, number>();
  const successCountByCard = new Map<string, number>();
  for (const log of leechLogs) {
    reviewCountByCard.set(log.flashcardId, (reviewCountByCard.get(log.flashcardId) ?? 0) + 1);
    if (log.rating === "GOOD" || log.rating === "EASY") {
      successCountByCard.set(log.flashcardId, (successCountByCard.get(log.flashcardId) ?? 0) + 1);
    }
  }

  const scheduledRows = reviewRows.filter(
    (r) => r.state === "REVIEW" || r.state === "RELEARNING",
  );

  const learnedCards = scheduledRows.length;
  const learnedToday = scheduledRows.filter(
    (r) => r.updatedAt.getTime() >= dayStart.getTime(),
  ).length;

  const reviewsThisWeek = monthLogs.filter(
    (l) => l.reviewedAt.getTime() >= weekAgo.getTime(),
  ).length;

  const successful = monthLogs.filter(wasSuccessful).length;
  const measuredRetention =
    monthLogs.length > 0 ? successful / monthLogs.length : null;

  const predictedRetention =
    scheduledRows.length > 0
      ? scheduledRows.reduce((sum, r) => sum + predictRetention(r, now), 0) /
        scheduledRows.length
      : null;

  const reviewStates = reviewRows.filter((r) => r.state === "REVIEW");
  const avgIntervalDays =
    reviewStates.length > 0
      ? reviewStates.reduce((sum, r) => sum + r.intervalDays, 0) /
        reviewStates.length
      : null;

  const responseTimes = monthLogs
    .map((l) => l.responseTimeMs)
    .filter((t): t is number => t !== null)
    .sort((a, b) => a - b);
  const medianResponseTimeMs =
    responseTimes.length > 0
      ? responseTimes[Math.floor(responseTimes.length / 2)]
      : null;

  // Activity series (last 14 days).
  const activityMap = new Map<string, ActivityPoint>();
  for (let i = 0; i < 14; i++) {
    const d = new Date(activityStart.getTime() + i * DAY_MS);
    activityMap.set(dateKey(d), { date: dateKey(d), reviews: 0, successful: 0 });
  }
  for (const log of monthLogs) {
    if (log.reviewedAt.getTime() < activityStart.getTime()) continue;
    const point = activityMap.get(dateKey(log.reviewedAt));
    if (!point) continue;
    point.reviews += 1;
    if (wasSuccessful(log)) point.successful += 1;
  }
  const activity = [...activityMap.values()];

  // Streak: consecutive days (ending today or yesterday) with ≥ 1 review.
  const reviewDays = new Set(monthLogs.map((l) => dateKey(l.reviewedAt)));
  let streak = 0;
  const cursor = new Date(now);
  if (!reviewDays.has(dateKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  while (reviewDays.has(dateKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  // Per-deck stats.
  const totalByDeck = new Map(cardCounts.map((c) => [c.deckId, groupCount(c)]));
  const nowMs = now.getTime();
  const decks: DeckStat[] = deckList.map((deck) => {
    const rows = reviewRows.filter((r) => r.flashcard.deckId === deck.id);
    const reviewed = rows.length;
    const due = rows.filter((r) => r.dueAt.getTime() <= nowMs).length;
    const retainable = rows.filter(
      (r) => r.state === "REVIEW" || r.state === "RELEARNING",
    );
    const retention =
      retainable.length > 0
        ? retainable.reduce((sum, r) => sum + predictRetention(r, now), 0) /
          retainable.length
        : null;
    return {
      deckId: deck.id,
      title: deck.title,
      total: totalByDeck.get(deck.id) ?? 0,
      due,
      fresh: (totalByDeck.get(deck.id) ?? 0) - reviewed,
      reviewed,
      retention: retention !== null ? Math.round(retention * 100) / 100 : null,
    };
  });

  // Difficulty mix.
  const difficultyMix = { easy: 0, medium: 0, hard: 0 };
  for (const r of reviewRows) {
    if (r.difficulty >= 7) difficultyMix.hard += 1;
    else if (r.difficulty >= 4) difficultyMix.medium += 1;
    else difficultyMix.easy += 1;
  }

  // Leech cards: lapses ≥ 4, or ≥ 8 reviews with success rate < 35%.
  const leechMap = new Map<
    string,
    { lapses: number; reviews: number; success: number }
  >();
  for (const r of reviewRows) {
    if (r.lapses >= 4) {
      const entry = leechMap.get(r.flashcardId) ?? { lapses: 0, reviews: 0, success: 0 };
      entry.lapses = r.lapses;
      leechMap.set(r.flashcardId, entry);
    }
  }
  for (const [cardId, count] of reviewCountByCard) {
    if (count >= 8) {
      const success = successCountByCard.get(cardId) ?? 0;
      if (success / count < 0.35) {
        const entry = leechMap.get(cardId) ?? { lapses: 0, reviews: 0, success: 0 };
        entry.reviews = count;
        entry.success = success;
        leechMap.set(cardId, entry);
      }
    }
  }

  const promptByCard = new Map(cardPrompts.map((c) => [c.id, c.prompt ?? "Untitled card"]));
  const deckTitleByDeck = new Map(deckList.map((d) => [d.id, d.title]));
  const deckIdByCard = new Map(reviewRows.map((r) => [r.flashcardId, r.flashcard.deckId]));

  const leechCards: FlashcardStats["leechCards"] = [];
  for (const [cardId, entry] of leechMap) {
    const reviews = Math.max(entry.reviews, reviewCountByCard.get(cardId) ?? 0);
    const success = entry.success > 0 ? entry.success : successCountByCard.get(cardId) ?? 0;
    const deckId = deckIdByCard.get(cardId);
    leechCards.push({
      cardId,
      prompt: promptByCard.get(cardId) ?? "Untitled card",
      deckTitle: (deckId && deckTitleByDeck.get(deckId)) ?? "Unknown deck",
      lapses: entry.lapses,
      reviews,
      successRate: reviews > 0 ? Math.round((success / reviews) * 100) : 0,
    });
  }
  leechCards.sort((a, b) => b.lapses - a.lapses || a.successRate - b.successRate);

  const totalDue = reviewRows.filter((r) => r.dueAt.getTime() <= nowMs).length;
  const totalCards = cardCounts.reduce((sum, c) => sum + groupCount(c), 0);
  const totalNew = totalCards - reviewRows.length;

  return {
    reviewsToday: todayLogs.length,
    reviewsThisWeek,
    totalReviews: logCount,
    cardsLearned: learnedCards,
    learnedToday,
    measuredRetention:
      measuredRetention !== null ? Math.round(measuredRetention * 100) / 100 : null,
    predictedRetention:
      predictedRetention !== null ? Math.round(predictedRetention * 100) / 100 : null,
    avgIntervalDays:
      avgIntervalDays !== null ? Math.round(avgIntervalDays * 10) / 10 : null,
    streak,
    medianResponseTimeMs,
    activity,
    decks,
    difficultyMix,
    leechCards,
    totalDue,
    totalNew,
  };
}

// ─── Smart recommendations ──────────────────────────────────

export async function getFlashcardRecommendations(
  db: PrismaClient,
  studentId: string,
): Promise<FlashcardRecommendation[]> {
  const now = new Date();
  const nowMs = now.getTime();
  const recommendations: FlashcardRecommendation[] = [];

  const [reviews, decks, completedLessons, weakMetrics, highYieldTopics] =
    await db.$transaction([
      db.flashcardReview.findMany({
        where: { studentId },
        select: {
          flashcardId: true,
          dueAt: true,
          intervalDays: true,
          stability: true,
          lastReviewedAt: true,
          state: true,
          lapses: true,
          flashcard: { select: { deckId: true, prompt: true } },
        },
      }),
      db.flashcardDeck.findMany({
        select: { id: true, title: true },
      }),
      db.studentProgress.findMany({
        where: { studentId, lessonId: { not: null }, status: "COMPLETED" },
        select: { lessonId: true },
      }),
      db.performanceMetric.findMany({
        where: { studentId, masteryLevel: { in: ["WEAK", "DEVELOPING"] } },
        select: { topicId: true },
      }),
      db.topic.findMany({
        where: { OR: [{ jambWeight: { gte: 0.7 } }, { waecWeight: { gte: 0.7 } }] },
        select: { id: true, title: true, jambWeight: true, waecWeight: true },
      }),
    ]);

  const deckById = new Map(decks.map((d) => [d.id, d.title]));
  const dueByDeck = new Map<string, number>();
  const overdueByDeck = new Map<string, number>();
  const lowRetention: string[] = [];

  for (const review of reviews) {
    const deckId = review.flashcard.deckId;
    if (review.dueAt.getTime() <= nowMs) {
      dueByDeck.set(deckId, (dueByDeck.get(deckId) ?? 0) + 1);
      const overdueThreshold = Math.max(review.intervalDays * 2, 7) * DAY_MS;
      if (nowMs - review.dueAt.getTime() > overdueThreshold) {
        overdueByDeck.set(deckId, (overdueByDeck.get(deckId) ?? 0) + 1);
      }
    }
    if (
      (review.state === "REVIEW" || review.state === "RELEARNING") &&
      review.lastReviewedAt &&
      predictRetention(review, now) < 0.75
    ) {
      lowRetention.push(review.flashcardId);
    }
  }

  const totalDue = reviews.filter((r) => r.dueAt.getTime() <= nowMs).length;
  if (totalDue > 0) {
    const [bestDeckId, due] =
      [...dueByDeck.entries()].sort((a, b) => b[1] - a[1])[0] ?? [undefined, 0];
    recommendations.push({
      id: "due-now",
      priority: "high",
      title: `${totalDue} card${totalDue === 1 ? "" : "s"} due now`,
      rationale: `${due} in "${deckById.get(bestDeckId ?? "") ?? "your decks"}". A few minutes today keeps the forgetting curve flat.`,
      href: bestDeckId ? `/flashcards/${bestDeckId}` : "/flashcards",
      deckId: bestDeckId,
    });
  }

  const totalOverdue = [...overdueByDeck.values()].reduce((a, b) => a + b, 0);
  if (totalOverdue > 0) {
    const [bestDeckId, count] =
      [...overdueByDeck.entries()].sort((a, b) => b[1] - a[1])[0] ?? [undefined, 0];
    recommendations.push({
      id: "overdue",
      priority: "high",
      title: `${totalOverdue} overdue card${totalOverdue === 1 ? "" : "s"}`,
      rationale: `The longest-waiting are past 2× their interval${count > 0 ? ` (${count} in "${deckById.get(bestDeckId ?? "") ?? "a deck"}")` : ""}. Overdue cards decay fastest.`,
      href: bestDeckId ? `/flashcards/${bestDeckId}` : "/flashcards",
      deckId: bestDeckId,
    });
  }

  if (lowRetention.length > 0) {
    recommendations.push({
      id: "low-retention",
      priority: "medium",
      title: `${lowRetention.length} cards need a refresher`,
      rationale:
        "Their predicted recall has dropped below 75%. One quick pass re-cements them.",
      href: "/flashcards",
    });
  }

  // Leeches: cards with ≥ 4 lapses. They consume disproportionate time for no gain.
  const leechCards = reviews.filter((r) => r.lapses >= 4);
  if (leechCards.length > 0) {
    const leechByDeck = new Map<string, number>();
    for (const r of leechCards) {
      const deckId = r.flashcard.deckId;
      leechByDeck.set(deckId, (leechByDeck.get(deckId) ?? 0) + 1);
    }
    const [bestDeckId, count] =
      [...leechByDeck.entries()].sort((a, b) => b[1] - a[1])[0] ?? [undefined, 0];
    recommendations.push({
      id: "leech",
      priority: "medium",
      title: `Relearn these: ${leechCards.length} card${leechCards.length === 1 ? "" : "s"} keep slipping`,
      rationale:
        count > 0
          ? `${count} in "${deckById.get(bestDeckId ?? "") ?? "one of your decks"}". They've lapsed ${leechCards[0].lapses}+ times — relearn them fresh, then restudy at a gentler pace.`
          : "They've lapsed 4+ times. Relearn them fresh, then restudy at a gentler pace.",
      href: bestDeckId ? `/flashcards/${bestDeckId}` : "/flashcards",
      deckId: bestDeckId,
    });
  }

  // Lessons completed but never turned into a deck.
  const lessonIds = completedLessons
    .map((p) => p.lessonId)
    .filter((id): id is string => id !== null);
  const existingDeckLessons = new Set(
    (
      await db.flashcardDeck.findMany({
        where: { lessonId: { in: lessonIds } },
        select: { lessonId: true },
      })
    ).map((d) => d.lessonId),
  );
  const untappedLessons = await db.studentProgress.findMany({
    where: {
      studentId,
      status: "COMPLETED",
      lessonId: { in: lessonIds.filter((id) => !existingDeckLessons.has(id)) },
    },
    select: { lesson: { select: { id: true, title: true } } },
    take: 3,
  });
  for (const progress of untappedLessons) {
    if (!progress.lesson) continue;
    recommendations.push({
      id: `untapped-${progress.lesson.id}`,
      priority: "medium",
      title: `Turn "${progress.lesson.title}" into cards`,
      rationale:
        "You finished this lesson. Converting it to flashcards is the highest-leverage move you can make today.",
      href: `/flashcards?lesson=${progress.lesson.id}`,
    });
  }

  // Weak topics with no deck yet.
  const weakTopicIds = weakMetrics
    .map((m) => m.topicId)
    .filter((id): id is string => id !== null);
  if (weakTopicIds.length > 0) {
    const topicDeckCounts = await db.flashcardDeck.groupBy({
      by: ["topicId"],
      where: { topicId: { in: weakTopicIds } },
      _count: { _all: true },
      orderBy: { topicId: "asc" },
    });
    const topicDecks = new Map(topicDeckCounts.map((t) => [t.topicId, groupCount(t)]));
    const weakNoDeck = weakTopicIds.filter((id) => !(topicDecks.get(id) ?? 0));
    if (weakNoDeck.length > 0) {
      recommendations.push({
        id: "weak-topic",
        priority: "low",
        title: "Your weakest topics have no card deck",
        rationale: `${weakNoDeck.length} weak topic${weakNoDeck.length === 1 ? "" : "s"} have no flashcards. Adding them turns a diagnosed weakness into daily practice.`,
        href: "/flashcards",
      });
    }
  }

  // High-yield topics that are due right now.
  const highYieldIds = new Set(highYieldTopics.map((t) => t.id));
  const highYieldDeckByTopic = new Map<string, string>();
  const deckTopicRows = await db.flashcardDeck.findMany({
    where: { topicId: { in: [...highYieldIds] } },
    select: { id: true, topicId: true },
  });
  for (const deck of deckTopicRows) {
    if (deck.topicId && highYieldIds.has(deck.topicId)) {
      highYieldDeckByTopic.set(deck.topicId, deck.id);
    }
  }
  const highYieldDue: string[] = [];
  for (const topic of highYieldTopics) {
    const deckId = highYieldDeckByTopic.get(topic.id);
    if (deckId && (dueByDeck.get(deckId) ?? 0) > 0) {
      highYieldDue.push(topic.title);
    }
  }
  if (highYieldDue.length > 0) {
    recommendations.push({
      id: "high-yield",
      priority: "low",
      title: "High-yield topic is due",
      rationale: `${highYieldDue.join(", ")} carry high JAMB/WAEC weight and have cards due now.`,
      href: "/flashcards",
    });
  }

  if (recommendations.length === 0) {
    recommendations.push({
      id: "empty",
      priority: "low",
      title: "You're all caught up",
      rationale:
        "No cards are due. Add a deck or turn a finished lesson into cards to keep the momentum.",
      href: "/flashcards",
    });
  }

  return recommendations;
}

// ─── Study session queue ───────────────────────────────────

const DAILY_NEW_BUDGET = 20;

/** Builds the study queue: due cards first (newest review first), then new
 * cards capped to a daily budget. Used by the deck study-session page. */
export async function getStudyQueue(
  db: PrismaClient,
  studentId: string,
  deckId: string,
): Promise<StudyCardState[]> {
  const now = new Date();
  const nowMs = now.getTime();

  const [cards, reviews] = await Promise.all([
    db.flashcard.findMany({
      where: { deckId },
      select: {
        id: true,
        cardType: true,
        prompt: true,
        payload: true,
        difficulty: true,
      },
      orderBy: { orderIndex: "asc" },
    }),
    db.flashcardReview.findMany({
      where: { studentId, flashcard: { deckId } },
      select: {
        flashcardId: true,
        state: true,
        intervalDays: true,
        retention: true,
        difficulty: true,
        dueAt: true,
        lastReviewedAt: true,
      },
    }),
  ]);

  const reviewByCard = new Map(reviews.map((r) => [r.flashcardId, r]));

  const due: StudyCardState[] = [];
  const fresh: StudyCardState[] = [];

  for (const card of cards) {
    const review = reviewByCard.get(card.id);
    const base: StudyCardState = {
      cardId: card.id,
      cardType: card.cardType,
      prompt: card.prompt,
      payload: card.payload,
      authoredDifficulty: card.difficulty,
      review: review
        ? {
            state: review.state,
            intervalDays: review.intervalDays,
            retention: review.retention,
            difficulty: review.difficulty,
            dueAt: review.dueAt.toISOString(),
            lastReviewedAt: review.lastReviewedAt?.toISOString() ?? null,
          }
        : null,
    };

    if (!review || review.dueAt.getTime() <= nowMs) {
      due.push(base);
    } else {
      fresh.push(base);
    }
  }

  // Due cards: overdue ones that were reviewed longer ago go first.
  due.sort((a, b) => {
    const aLast = a.review ? new Date(a.review.dueAt).getTime() : 0;
    const bLast = b.review ? new Date(b.review.dueAt).getTime() : 0;
    return aLast - bLast;
  });

  const newBudget = Math.max(0, DAILY_NEW_BUDGET - due.length);
  return [...due, ...fresh.slice(0, newBudget)];
}
