import type { ReviewRating } from "@/lib/spaced-repetition";
import type { FlashcardType } from "@/lib/flashcard-content";

/** A deck as shown on the flashcards hub. */
export type DeckSummary = {
  id: string;
  title: string;
  description: string | null;
  source: "AUTHORED" | "LESSON" | "AI";
  subjectName: string | null;
  topicTitle: string | null;
  totalCards: number;
  /** Review rows due now. */
  due: number;
  /** Cards never reviewed (learnable now). */
  fresh: number;
  /** Cards with at least one review. */
  reviewed: number;
  enrolled: boolean;
  lastReviewedAt: string | null;
};

/** One card + its per-student scheduling state, for the study session. */
export type StudyCardState = {
  cardId: string;
  cardType: FlashcardType;
  prompt: string | null;
  payload: unknown;
  authoredDifficulty: string;
  review: {
    state: string;
    intervalDays: number;
    retention: number;
    difficulty: number;
    dueAt: string;
    lastReviewedAt: string | null;
  } | null;
};

/** Server response after a single review is recorded. */
export type ReviewOutcome = {
  cardId: string;
  rating: ReviewRating;
  state: string;
  intervalDays: number;
  retention: number;
  dueAt: string;
};

export type ActivityPoint = {
  date: string;
  reviews: number;
  successful: number;
};

export type DeckStat = {
  deckId: string;
  title: string;
  total: number;
  due: number;
  fresh: number;
  reviewed: number;
  retention: number | null;
};

export type FlashcardStats = {
  reviewsToday: number;
  reviewsThisWeek: number;
  totalReviews: number;
  cardsLearned: number;
  learnedToday: number;
  measuredRetention: number | null;
  predictedRetention: number | null;
  avgIntervalDays: number | null;
  streak: number;
  medianResponseTimeMs: number | null;
  activity: ActivityPoint[];
  decks: DeckStat[];
  difficultyMix: { easy: number; medium: number; hard: number };
  leechCards: {
    cardId: string;
    prompt: string;
    deckTitle: string;
    lapses: number;
    reviews: number;
    successRate: number;
  }[];
  totalDue: number;
  totalNew: number;
};

export type FlashcardRecommendation = {
  id: string;
  priority: "high" | "medium" | "low";
  title: string;
  rationale: string;
  href?: string;
  deckId?: string;
};
