// End-to-end validation of the review pipeline against the real database.
// Mirrors the logic in src/app/api/flashcards/review/route.ts (the route itself
// needs a NextAuth session, which we can't create outside the app).
// Covers spec verification items 3, 4 and 5.

import { PrismaClient } from "@prisma/client";
import { initialState, reviewCard, type ReviewState } from "../src/lib/spaced-repetition";
import { getFlashcardRecommendations, getFlashcardStats } from "../src/lib/flashcard-analytics";
import type { ReviewRating } from "../src/lib/spaced-repetition";

const prisma = new PrismaClient();

async function recordReview(
  studentId: string,
  flashcardId: string,
  rating: ReviewRating,
  objectiveCorrect: boolean | null,
) {
  const card = await prisma.flashcard.findUnique({
    where: { id: flashcardId },
    select: { id: true, difficulty: true },
  });
  if (!card) throw new Error(`card ${flashcardId} not found`);
  const existing = await prisma.flashcardReview.findUnique({
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
    : initialState(card.difficulty, now);
  const next = reviewCard(prior, { rating, reviewedAt: now });
  const [review] = await prisma.$transaction([
    prisma.flashcardReview.upsert({
      where: { studentId_flashcardId: { studentId, flashcardId } },
      create: {
        studentId,
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
    prisma.flashcardReviewLog.create({
      data: {
        studentId,
        flashcardId,
        rating,
        responseTimeMs: 4200,
        scheduledDays: next.intervalDays,
        objectiveCorrect,
        reviewedAt: now,
      },
    }),
  ]);
  return { state: review, next };
}

const user = await prisma.user.findFirst({ select: { id: true } });
if (!user) {
  console.log("no user found");
  process.exit(1);
}
const studentId = user.id;

const deck = await prisma.flashcardDeck.findFirstOrThrow({
  where: { slug: "biology-the-cell" },
  select: { id: true, cards: { orderBy: { orderIndex: "asc" }, select: { id: true, cardType: true, prompt: true } } },
});

const definition = deck.cards.find((c) => c.cardType === "DEFINITION")!;
const fillBlank = deck.cards.find((c) => c.cardType === "FILL_IN_BLANK")!;
const leechCard = deck.cards.find((c) => c.cardType === "TRUE_FALSE")!;

// Reset test rows so the simulation is deterministic.
await prisma.flashcardReview.deleteMany({
  where: { studentId, flashcardId: { in: [definition.id, fillBlank.id, leechCard.id] } },
});
await prisma.flashcardReviewLog.deleteMany({
  where: { studentId, flashcardId: { in: [definition.id, fillBlank.id, leechCard.id] } },
});

// Enroll (spec 3: study a deck).
await prisma.flashcardEnrollment.upsert({
  where: { studentId_deckId: { studentId, deckId: deck.id } },
  create: { studentId, deckId: deck.id },
  update: {},
});
console.log("enrolled in", deck.id);

// ── Spec 3: study → rate GOOD → next due date in the future; log row written.
console.log("\n— Spec 3: review a definition card —");
let r = await recordReview(studentId, definition.id, "GOOD", null);
console.log(`  after GOOD: state=${r.next.state} intervalDays=${r.next.intervalDays} dueAt=${r.next.dueAt}`);
const logRows = await prisma.flashcardReviewLog.count({
  where: { studentId, flashcardId: definition.id },
});
console.log(`  log rows written: ${logRows}`);
r = await recordReview(studentId, definition.id, "GOOD", null);
const dueInFuture = new Date(r.next.dueAt).getTime() > Date.now();
console.log(`  after 2×GOOD: state=${r.next.state} interval=${r.next.intervalDays}d dueInFuture=${dueInFuture}`);
if (r.next.state !== "REVIEW" || !dueInFuture) throw new Error("SPEC 3 FAILED");

// ── Spec 4: fill-in-the-blank wrong → objective miss recorded; rate Again → ~1 min.
console.log("\n— Spec 4: fill-in-the-blank wrong —");
r = await recordReview(studentId, fillBlank.id, "AGAIN", false);
const minutes = r.next.intervalDays * 1440;
const log = await prisma.flashcardReviewLog.findFirst({
  where: { studentId, flashcardId: fillBlank.id },
  orderBy: { reviewedAt: "desc" },
  select: { objectiveCorrect: true, rating: true },
});
console.log(`  after AGAIN+objective=false: state=${r.next.state} interval=${minutes.toFixed(2)}min objectiveCorrect=${log?.objectiveCorrect}`);
if (Math.abs(minutes - 1) > 0.01) throw new Error("SPEC 4 FAILED: interval not ~1 min");
if (log?.objectiveCorrect !== false) throw new Error("SPEC 4 FAILED: objective miss not recorded");

// ── Spec 5: force a leech (4 lapses) → "Relearn these" recommendation.
console.log("\n— Spec 5: force a leech —");
r = await recordReview(studentId, leechCard.id, "GOOD", null);
r = await recordReview(studentId, leechCard.id, "GOOD", null); // → REVIEW
let lapses = 0;
while (lapses < 4) {
  r = await recordReview(studentId, leechCard.id, "AGAIN", null); // REVIEW → RELEARNING, lapse++
  lapses = r.next.lapses;
  if (lapses >= 4) break;
  r = await recordReview(studentId, leechCard.id, "EASY", null); // recover toward REVIEW
  r = await recordReview(studentId, leechCard.id, "EASY", null);
}
console.log(`  leech card now has lapses=${r.next.lapses} state=${r.next.state}`);

const recs = await getFlashcardRecommendations(prisma, studentId);
const leechRec = recs.find((rec) => rec.id === "leech");
console.log("  recommendations:", recs.map((x) => `${x.priority}:${x.title}`).join(" | "));
if (!leechRec) throw new Error("SPEC 5 FAILED: no 'Relearn these' recommendation");

const stats = await getFlashcardStats(prisma, studentId);
console.log(`  stats: reviewsToday=${stats.reviewsToday} leechCards=${stats.leechCards.length} measuredRetention=${stats.measuredRetention}`);
if (!stats.leechCards.some((c) => c.cardId === leechCard.id)) throw new Error("SPEC 5 FAILED: leech not in stats");

console.log("\n✅ Review pipeline + spec items 3, 4, 5 all PASS");
await prisma.$disconnect();
