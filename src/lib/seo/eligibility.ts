/**
 * The thin-content gate.
 *
 * Generating one page per topic and per exam-subject-year triple produces
 * hundreds of URLs. Hundreds of near-empty auto-generated URLs is how a site
 * earns a doorway-page classification, which applies sitewide and is hard to
 * reverse. So a page that fails these thresholds 404s AND is left out of the
 * sitemap — both driven from here, so the two cannot disagree.
 */
export const TOPIC_MIN_SUBTOPICS = 2;
export const TOPIC_MIN_QUESTIONS = 3;
export const PAPER_MIN_QUESTIONS = 10;

/** How many worked questions each page shows before the gate. */
export const TOPIC_SAMPLE_COUNT = 3;
export const PAPER_SAMPLE_COUNT = 5;

export type TopicEligibilityInput = {
  description: string | null;
  subtopicCount: number;
  /** Count already narrowed by publicQuestionWhere(). */
  publicQuestionCount: number;
};

export function isTopicPageEligible({
  description,
  subtopicCount,
  publicQuestionCount,
}: TopicEligibilityInput): boolean {
  const hasProse = (description?.trim().length ?? 0) > 0;
  const hasSubstance = hasProse || subtopicCount >= TOPIC_MIN_SUBTOPICS;
  return hasSubstance && publicQuestionCount >= TOPIC_MIN_QUESTIONS;
}

export function isPaperPageEligible({
  publicQuestionCount,
}: {
  publicQuestionCount: number;
}): boolean {
  return publicQuestionCount >= PAPER_MIN_QUESTIONS;
}
