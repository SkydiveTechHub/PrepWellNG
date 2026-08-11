import type { Difficulty } from "@/types/prisma";

// Learning Evidence Layer — scoring primitives.
// See docs/superpowers/specs/2026-08-11-learning-evidence-layer-design.md

const DAY_MS = 86_400_000;

/**
 * Bumped whenever any constant below changes. A TopicMastery row carrying an
 * older version is replayed from the ledger rather than trusted.
 */
export const SCORING_VERSION = 1;

/**
 * Recency half-life. Deliberately long: this models how much an old answer
 * tells us about *current ability*, which is a different question from the
 * forgetting curve R(t) in mastery.ts. A short half-life here would
 * double-count forgetting.
 */
export const RECENCY_HALF_LIFE_DAYS = 45;

/** Prior strength, in questions. Four questions' worth of prior belief. */
export const PRIOR_STRENGTH = 4;

/** Prior belief for a topic with no evidence — slightly below neutral. */
export const PRIOR_OUTCOME = 0.45;

/** Below this, an answer was not read. */
export const RAPID_SECONDS = 3;

/**
 * Rapid guesses are down-weighted rather than dropped. Dropping them would
 * leave a student who speed-clicked twenty questions looking untouched.
 */
export const RAPID_WEIGHT = 0.3;

/** Below this confidence, mastery is not reported and not diagnosed. */
export const CONFIDENCE_FLOOR = 0.35;

/**
 * Difficulty adjusts the *outcome*, not the denominator, so the asymmetry
 * runs both ways: an easy question cannot prove mastery, and missing a hard
 * one is not proof of absence.
 */
const OUTCOME_BY_DIFFICULTY: Record<Difficulty, { correct: number; wrong: number }> = {
  BASIC: { correct: 0.85, wrong: 0.0 },
  INTERMEDIATE: { correct: 1.0, wrong: 0.15 },
  ADVANCED: { correct: 1.0, wrong: 0.35 },
};

/** The 0..1 outcome a single response contributes. */
export function responseOutcome(
  correct: boolean,
  difficulty: Difficulty | null,
): number {
  const band = OUTCOME_BY_DIFFICULTY[difficulty ?? "INTERMEDIATE"];
  return correct ? band.correct : band.wrong;
}

/** Whole days between two instants, clamped at zero against clock skew. */
export function ageInDays(from: Date, to: Date): number {
  return Math.max(0, (to.getTime() - from.getTime()) / DAY_MS);
}

/** 2^(-age/H) — the multiplicative form is what makes the fold incremental. */
export function recencyWeight(ageDays: number): number {
  return Math.pow(2, -Math.max(0, ageDays) / RECENCY_HALF_LIFE_DAYS);
}

/** Unknown timing is not evidence of guessing. */
export function isRapidGuess(seconds: number | null): boolean {
  return seconds !== null && seconds < RAPID_SECONDS;
}

export function responseWeight(ageDays: number, seconds: number | null): number {
  return recencyWeight(ageDays) * (isRapidGuess(seconds) ? RAPID_WEIGHT : 1);
}

/**
 * Bayesian shrinkage toward the prior. `score` is the channel's 0..1 estimate;
 * `confidence` is the share of that estimate coming from data rather than the
 * prior, which is the same quantity read from the other side.
 */
export function channelScore(
  weightedOutcome: number,
  mass: number,
): { score: number; confidence: number } {
  return {
    score: (weightedOutcome + PRIOR_STRENGTH * PRIOR_OUTCOME) / (mass + PRIOR_STRENGTH),
    confidence: mass / (mass + PRIOR_STRENGTH),
  };
}
