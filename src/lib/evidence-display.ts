import { CONFIDENCE_FLOOR } from "@/engines/learning/evidence";

// What a topic shows instead of a mastery figure when too little evidence
// backs it. See docs/superpowers/specs/2026-08-12-learning-evidence-layer-phase-2-design.md

export type EvidenceCounts = {
  confidence: number;
  accObservations: number;
  lessonObservations: number;
  srsObservations: number;
};

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

/**
 * The line to show in place of "N% mastery", or `null` when there is enough
 * evidence for the figure to mean something.
 *
 * Below the floor a percentage is worse than useless: it looks precise and
 * isn't. A count is honest about how much is behind it, and tells the student
 * what resolves it. Practice wins when channels are mixed because "questions
 * answered" is the model students already have.
 *
 * A topic with no evidence at all also returns null — it is untouched rather
 * than thinly measured, and its zero mastery is shown as it always was.
 */
export function evidenceLabel(counts: EvidenceCounts): string | null {
  if (counts.confidence >= CONFIDENCE_FLOOR) return null;
  if (counts.accObservations > 0) {
    return `${plural(counts.accObservations, "question")} answered`;
  }
  if (counts.lessonObservations > 0) return "Lesson in progress";
  if (counts.srsObservations > 0) {
    return plural(counts.srsObservations, "card review");
  }
  return null;
}
