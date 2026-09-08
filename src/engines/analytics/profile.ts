import type { Difficulty } from "@/types/prisma";
import { isRapidGuess } from "../learning/evidence";

// How a student answers, as distinct from how well.
// See docs/superpowers/specs/2026-08-28-performance-analytics-design.md §4.

export type AnswerSample = {
  difficulty: Difficulty | null;
  correct: boolean;
  seconds: number | null;
};

export type DifficultyBandKey = Difficulty | "UNLABELLED";

export type DifficultyBand = {
  difficulty: DifficultyBandKey;
  answered: number;
  /** Percentage, 0..100. */
  accuracy: number;
};

export type PacingVerdict = "RUSHED" | "ON_PACE" | "SLOW";

export type Pacing = {
  meanSeconds: number;
  expectedSeconds: number;
  /** meanSeconds / expectedSeconds. */
  ratio: number;
  verdict: PacingVerdict;
};

export type Profile =
  | { status: "insufficient"; answered: number; needed: number }
  | {
      status: "ok";
      answered: number;
      bands: DifficultyBand[];
      /** Percentage of answers that were rapid guesses, 0..100. */
      rapidGuessRate: number;
      /** Null when nothing can be said: no timings, or no authored estimate. */
      pacing: Pacing | null;
    };

/**
 * Below this, a profile is noise. Twenty answers is roughly one practice
 * session — enough that each difficulty band has a chance of being non-empty,
 * and low enough that a student sees the band after a single sitting.
 */
export const PROFILE_MIN_ANSWERS = 20;

export const RUSHED_RATIO = 0.6;
export const SLOW_RATIO = 1.3;

const BAND_ORDER: DifficultyBandKey[] = [
  "BASIC",
  "INTERMEDIATE",
  "ADVANCED",
  "UNLABELLED",
];

/**
 * `expectedSeconds` is the subject's authored mean `timeEstimateSeconds`, or
 * null when the subject has no authored estimates.
 *
 * It is a subject-level mean rather than a per-question join because
 * `LearningEvent.sourceId` is documented as being for audit rather than logic
 * and carries no index — a coarser figure is the honest cost of not adding an
 * index to serve a display metric.
 */
export function buildProfile(
  samples: readonly AnswerSample[],
  expectedSeconds: number | null,
): Profile {
  const answered = samples.length;
  if (answered < PROFILE_MIN_ANSWERS) {
    return { status: "insufficient", answered, needed: PROFILE_MIN_ANSWERS };
  }

  const bands: DifficultyBand[] = [];
  for (const key of BAND_ORDER) {
    const inBand = samples.filter(
      (s) => (s.difficulty ?? "UNLABELLED") === key,
    );
    // An empty band is omitted rather than reported as 0% — a band nobody has
    // answered is not a band the student is failing.
    if (inBand.length === 0) continue;
    const correct = inBand.filter((s) => s.correct).length;
    bands.push({
      difficulty: key,
      answered: inBand.length,
      accuracy: (correct / inBand.length) * 100,
    });
  }

  const timed = samples.filter(
    (s): s is AnswerSample & { seconds: number } => s.seconds !== null,
  );
  const rapid = timed.filter((s) => isRapidGuess(s.seconds)).length;
  const rapidGuessRate = (rapid / answered) * 100;

  let pacing: Pacing | null = null;
  if (timed.length > 0 && expectedSeconds !== null && expectedSeconds > 0) {
    const meanSeconds =
      timed.reduce((sum, s) => sum + s.seconds, 0) / timed.length;
    const ratio = meanSeconds / expectedSeconds;
    pacing = {
      meanSeconds,
      expectedSeconds,
      ratio,
      verdict:
        ratio < RUSHED_RATIO ? "RUSHED" : ratio > SLOW_RATIO ? "SLOW" : "ON_PACE",
    };
  }

  return { status: "ok", answered, bands, rapidGuessRate, pacing };
}
