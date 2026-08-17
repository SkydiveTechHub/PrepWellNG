import type { Difficulty } from "@/types/prisma";

// Learning Evidence Layer — scoring primitives.
// See docs/superpowers/specs/2026-08-11-learning-evidence-layer-design.md

const DAY_MS = 86_400_000;

/**
 * Bumped whenever any constant below changes. A TopicMastery row carrying an
 * older version is replayed from the ledger rather than trusted.
 *
 * This is also the operational repair lever. Postgres allocates
 * LearningEvent.seq at insert but makes it visible at commit, so a
 * slow-committing transaction can be skipped by a read that advances a topic's
 * cursor past it. Phase 1 ships no automatic reconciliation (the spec assigns a
 * daily cursor-reset-and-replay to Phase 3). Until then, bumping this constant
 * forces a full per-topic replay on the next read and repairs any such drift.
 *
 * Bumped to 2 in Phase 2, which added per-channel observation counts. Existing
 * rows have no counts and no write can backfill them; the version mismatch
 * forces a full replay from the ledger on next read, which recomputes them
 * from source.
 */
export const SCORING_VERSION = 2;

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
 * Minimum raw observations before a topic can be diagnosed DECAYED.
 *
 * Confidence decays with age; observation counts do not. DECAYED asks "did
 * this student once know it and lose it?", which is a question about how much
 * evidence was ever gathered, not about how fresh that evidence is. Gating it
 * on confidence made the category chase its own tail: retention and confidence
 * fall together, so a topic became DECAYED and then silently stopped being
 * DECAYED while getting staler.
 *
 * 3 matches CONFIDENCE_FLOOR for fresh evidence — mass crosses 0.35 on the
 * third non-rapid answer — so the two gates agree at t=0 and diverge only with
 * age, which is the intent.
 */
export const OBSERVATION_FLOOR = 3;

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
