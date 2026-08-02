// Spaced Repetition Engine — SM-2 structure + FSRS-style stability, difficulty,
// and retrievability. Pure and deterministic: the same (state, rating, now)
// always yields the same next state.
//
// See docs/superpowers/specs/2026-08-01-flashcards-design.md for the full
// cognitive rationale.

export type ReviewRating = "AGAIN" | "HARD" | "GOOD" | "EASY";
export type CardState = "NEW" | "LEARNING" | "REVIEW" | "RELEARNING";
export type AuthoredDifficulty = "BASIC" | "INTERMEDIATE" | "ADVANCED";

/** The scheduling state the engine reads and writes (JSON-safe). */
export interface ReviewState {
  state: CardState;
  /** Memory strength in days (FSRS stability). */
  stability: number;
  /** 1..10, seeded from the authored difficulty, evolves per outcome. */
  difficulty: number;
  /** SM-2 ease factor, floored at 1.3. */
  easeFactor: number;
  /** Days until the next review. */
  intervalDays: number;
  /** Consecutive successes in the current phase. */
  repetitions: number;
  /** Total "Again" presses on a REVIEW card (leech detection). */
  lapses: number;
  /** Predicted recall probability at the scheduled due time (0..1). */
  retention: number;
  dueAt: string;
  lastReviewedAt: string | null;
}

export interface ReviewInput {
  rating: ReviewRating;
  reviewedAt?: Date;
}

// ─── Tunable constants ──────────────────────────────────────

export const EASE_FLOOR = 1.3;
export const EASE_CEILING = 5.0;
export const DIFFICULTY_MIN = 1;
export const DIFFICULTY_MAX = 10;
export const DIFFICULTY_INITIAL = 5;
export const MAX_INTERVAL_DAYS = 36500;
export const MIN_INTERVAL_DAYS = 1 / 1440; // 1 minute
/** A review is due when predicted retention reaches this probability. */
export const DESIRED_RETENTION = 0.9;

/** FSRS forgetting-curve constants: R(t) = (1 + 19/81 · t/S)^-0.5. */
const RETENTION_FACTOR = 19 / 81;
const RETENTION_DECAY = -0.5;

/** Learning-step intervals in minutes. EASY = 1440 min = 1 day. */
const LEARNING_INTERVAL_MINUTES: Record<ReviewRating, number> = {
  AGAIN: 1,
  HARD: 5,
  GOOD: 10,
  EASY: 1440,
};

/** Stability seeded on first exposure (days). */
const INITIAL_STABILITY: Record<ReviewRating, number> = {
  AGAIN: 0.1,
  HARD: 0.5,
  GOOD: 1.0,
  EASY: 2.0,
};

/** Stability growth on a successful learning/relearning step. */
const LEARNING_GROWTH: Record<"HARD" | "GOOD" | "EASY", number> = {
  HARD: 1.0,
  GOOD: 1.6,
  EASY: 2.5,
};

/** Extra stability growth on a successful REVIEW pass. */
const REVIEW_GROWTH: Record<"HARD" | "GOOD" | "EASY", number> = {
  HARD: 0.8,
  GOOD: 1.0,
  EASY: 1.3,
};

/** After a lapse, memory resets to this base and must be re-earned. */
const LAPSE_STABILITY = 1.0;

/** SM-2 quality mapping: Again=1, Hard=3, Good=4, Easy=5. */
const SM2_Q: Record<ReviewRating, number> = {
  AGAIN: 1,
  HARD: 3,
  GOOD: 4,
  EASY: 5,
};

export const RATINGS: ReviewRating[] = ["AGAIN", "HARD", "GOOD", "EASY"];
export const RATING_INDEX: Record<ReviewRating, number> = {
  AGAIN: 0,
  HARD: 1,
  GOOD: 2,
  EASY: 3,
};
export const RATING_LABEL: Record<ReviewRating, string> = {
  AGAIN: "Again",
  HARD: "Hard",
  GOOD: "Good",
  EASY: "Easy",
};
export const RATING_KEY: Record<ReviewRating, string> = {
  AGAIN: "1",
  HARD: "2",
  GOOD: "3",
  EASY: "4",
};

// ─── Time helpers ───────────────────────────────────────────

export function elapsedDays(fromIso: string, at: Date): number {
  const from = new Date(fromIso);
  return Math.max(0, (at.getTime() - from.getTime()) / 86_400_000);
}

function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * 86_400_000);
}

// ─── The forgetting curve ───────────────────────────────────

/** FSRS R(t): predicted probability the card is recallable after `elapsedDays`. */
export function retentionAt(elapsedDays: number, stability: number): number {
  if (stability <= 0) return 1;
  return Math.pow(1 + RETENTION_FACTOR * (elapsedDays / stability), RETENTION_DECAY);
}

/** Predicted recall probability right now, from the stored state. */
export function predictRetention(
  state: Pick<ReviewState, "stability"> & { lastReviewedAt: string | Date | null },
  at = new Date(),
): number {
  if (!state.lastReviewedAt) return 1;
  return retentionAt(
    elapsedDays(new Date(state.lastReviewedAt).toISOString(), at),
    state.stability,
  );
}

// ─── Difficulty & ease factor ───────────────────────────────

/** Seed per-card difficulty (1..10) from the authored difficulty enum. */
export function initialDifficultyFromAuthored(d: AuthoredDifficulty): number {
  return d === "BASIC" ? 3 : d === "INTERMEDIATE" ? 5 : 7;
}

/** SM-2 ease-factor delta. */
function easeDelta(rating: ReviewRating): number {
  const q = SM2_Q[rating];
  return 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02);
}

/** FSRS-style difficulty delta: Again +1.4, Hard +0.7, Good 0, Easy −0.7, +2% mean reversion. */
function difficultyDelta(rating: ReviewRating, difficulty: number): number {
  return -0.7 * (RATING_INDEX[rating] - 2) + 0.02 * (DIFFICULTY_INITIAL - difficulty);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, places = 2): number {
  const factor = Math.pow(10, places);
  return Math.round(value * factor) / factor;
}

// ─── State transitions ──────────────────────────────────────

export function initialState(authoredDifficulty: AuthoredDifficulty = "INTERMEDIATE", now = new Date()): ReviewState {
  return {
    state: "NEW",
    stability: 0,
    difficulty: initialDifficultyFromAuthored(authoredDifficulty),
    easeFactor: 2.5,
    intervalDays: 0,
    repetitions: 0,
    lapses: 0,
    retention: 1,
    dueAt: now.toISOString(),
    lastReviewedAt: null,
  };
}

/** Advances the schedule for one review. Returns a fresh state (input is untouched). */
export function reviewCard(state: ReviewState, input: ReviewInput): ReviewState {
  const rating = input.rating;
  const now = input.reviewedAt ?? new Date();

  const difficulty = clamp(
    state.difficulty + difficultyDelta(rating, state.difficulty),
    DIFFICULTY_MIN,
    DIFFICULTY_MAX,
  );
  const easeFactor = clamp(state.easeFactor + easeDelta(rating), EASE_FLOOR, EASE_CEILING);

  let next: CardState = state.state;
  let stability = state.stability;
  let intervalDays: number;
  let repetitions = state.repetitions;
  let lapses = state.lapses;

  switch (state.state) {
    case "NEW":
      if (rating === "AGAIN") {
        stability = INITIAL_STABILITY.AGAIN;
        repetitions = 0;
        next = "LEARNING";
        intervalDays = MIN_INTERVAL_DAYS;
      } else if (rating === "EASY") {
        stability = INITIAL_STABILITY.EASY;
        repetitions = 1;
        next = "REVIEW";
        intervalDays = Math.max(1, stability);
      } else {
        stability = INITIAL_STABILITY[rating];
        repetitions = 1;
        next = "LEARNING";
        intervalDays = LEARNING_INTERVAL_MINUTES[rating] / 1440;
      }
      break;

    case "LEARNING":
    case "RELEARNING":
      if (rating === "AGAIN") {
        stability = Math.min(stability || INITIAL_STABILITY.AGAIN, INITIAL_STABILITY.AGAIN);
        repetitions = 0;
        intervalDays = MIN_INTERVAL_DAYS;
      } else {
        repetitions += 1;
        stability = Math.max(1, (stability || INITIAL_STABILITY.GOOD) * LEARNING_GROWTH[rating]);
        if (repetitions >= 2) {
          next = "REVIEW";
          intervalDays = Math.max(1, stability);
        } else {
          intervalDays = LEARNING_INTERVAL_MINUTES[rating] / 1440;
        }
      }
      break;

    case "REVIEW":
      if (rating === "AGAIN") {
        lapses += 1;
        stability = LAPSE_STABILITY;
        repetitions = 0;
        next = "RELEARNING";
        intervalDays = MIN_INTERVAL_DAYS;
      } else {
        repetitions += 1;
        stability = state.stability * easeFactor * REVIEW_GROWTH[rating];
        intervalDays = Math.max(1, Math.round(stability));
      }
      break;
  }

  intervalDays = clamp(
    round(intervalDays, 6),
    MIN_INTERVAL_DAYS,
    MAX_INTERVAL_DAYS,
  );
  const dueAt = addDays(now, intervalDays);
  const retention = retentionAt(intervalDays, stability);

  return {
    state: next,
    stability: round(stability),
    difficulty: round(difficulty),
    easeFactor: round(easeFactor),
    intervalDays,
    repetitions,
    lapses,
    retention: round(retention, 3),
    dueAt: dueAt.toISOString(),
    lastReviewedAt: now.toISOString(),
  };
}

/** Whether a stored state is due for review at `at`. */
export function isDue(state: Pick<ReviewState, "dueAt">, at = new Date()): boolean {
  return new Date(state.dueAt).getTime() <= at.getTime();
}

/** Human label for the next interval ("in 3 days", "in 1 hour", "now"). */
export function intervalLabel(days: number): string {
  if (days <= 0) return "now";
  if (days < 1 / 24) return "in a minute";
  if (days < 1) return `in ${Math.round(days * 24)}h`;
  if (days < 30) return `in ${Math.max(1, Math.round(days))}d`;
  if (days < 365) return `in ${Math.round(days / 30)}mo`;
  return `in ${Math.round(days / 365)}y`;
}

/** Difficulty band for the UI. */
export function difficultyBand(d: number): "easy" | "medium" | "hard" {
  if (d >= 7) return "hard";
  if (d >= 4) return "medium";
  return "easy";
}
