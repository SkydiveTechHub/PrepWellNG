import { CONFIDENCE_FLOOR, OBSERVATION_FLOOR } from "@/engines/learning/evidence";

// What a topic shows instead of a mastery figure when too little evidence
// backs it. See docs/superpowers/specs/2026-08-12-learning-evidence-layer-phase-2-design.md

export type EvidenceCounts = {
  confidence: number;
  accObservations: number;
  lessonObservations: number;
  srsObservations: number;
  /**
   * Last-study timestamp as an ISO string, or null when there is none.
   *
   * A string, not a Date: this shape is passed straight through to
   * GraphViewNode, which is rendered by a "use client" component
   * (graph-view.tsx) and so crosses the server -> client boundary. This
   * project's convention for that boundary is ISO strings, not live Date
   * instances (see the comment on DashboardAttempt in lib/performance.ts) —
   * kept consistent here even though TopicGap/NextTopicRecommendation don't
   * currently cross that boundary themselves, so the three producers of this
   * shape don't have to disagree on representation.
   */
  lastStudy: string | null;
};

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

const DAY_MS = 86_400_000;

/**
 * A relative age a student would actually say out loud — "3 weeks ago", "8
 * months ago" — not a raw day count.
 */
function relativeAge(lastStudy: Date, now: Date): string {
  const days = Math.max(0, (now.getTime() - lastStudy.getTime()) / DAY_MS);
  if (days < 1) return "today";
  if (days < 7) {
    const n = Math.max(1, Math.round(days));
    return `${n} day${n === 1 ? "" : "s"} ago`;
  }
  if (days < 45) {
    const n = Math.round(days / 7);
    return `${n} week${n === 1 ? "" : "s"} ago`;
  }
  if (days < 365) {
    const n = Math.round(days / 30);
    return `${n} month${n === 1 ? "" : "s"} ago`;
  }
  const n = Math.round(days / 365);
  return `${n} year${n === 1 ? "" : "s"} ago`;
}

/**
 * The line to show in place of "N% mastery", or `null` when there is enough
 * evidence for the figure to mean something.
 *
 * Below the floor a percentage is worse than useless: it looks precise and
 * isn't. But low confidence means two different things, and they read very
 * differently to a student:
 *
 * - Genuinely thin evidence (below OBSERVATION_FLOOR raw observations) — the
 *   student hasn't given us enough to go on yet. A count is honest about how
 *   much is behind it, and tells the student what resolves it. Practice wins
 *   when channels are mixed because "questions answered" is the model
 *   students already have.
 * - Stale evidence (at or above OBSERVATION_FLOOR, but confidence has decayed
 *   with age) — the student *did* know this, and it faded. Telling them
 *   "N questions answered" here reads as "keep going, we don't know you yet"
 *   when the truth is "you knew this, revise it". A relative age ("Last
 *   practised 8 months ago") is honest about that instead.
 *
 * A topic with no evidence at all also returns null — it is untouched rather
 * than thinly measured, and its zero mastery is shown as it always was.
 *
 * `now` defaults to `new Date()` and exists so the relative-age formatting is
 * testable deterministically.
 */
export function evidenceLabel(counts: EvidenceCounts, now: Date = new Date()): string | null {
  if (counts.confidence >= CONFIDENCE_FLOOR) return null;

  const observations =
    counts.accObservations + counts.lessonObservations + counts.srsObservations;
  if (observations >= OBSERVATION_FLOOR && counts.lastStudy != null) {
    return `Last practised ${relativeAge(new Date(counts.lastStudy), now)}`;
  }
  // Either genuinely thin, or stale-but-undated (no lastStudy to report an
  // age from) — falls through to the count copy rather than fabricating a
  // date or crashing.

  if (counts.accObservations > 0) {
    return `${plural(counts.accObservations, "question")} answered`;
  }
  if (counts.lessonObservations > 0) return "Lesson in progress";
  if (counts.srsObservations > 0) {
    return plural(counts.srsObservations, "card review");
  }
  return null;
}
