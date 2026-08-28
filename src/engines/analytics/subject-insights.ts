import type { Insight } from "./insight";
import type { TopicGroups } from "./topic-groups";
import type { Profile } from "./profile";

// Findings the subject view emits. Pure: groups and profile in, insights out.
// See docs/superpowers/specs/2026-08-28-performance-analytics-design.md §9.

/** Above this share of rapid guesses, the student's own numbers are unreliable. */
export const RAPID_GUESS_ALARM = 20;

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

export function subjectInsights(input: {
  subjectId: string;
  subjectSlug: string;
  groups: TopicGroups;
  profile: Profile;
}): Insight[] {
  const { subjectId, subjectSlug, groups, profile } = input;
  const insights: Insight[] = [];

  // Rapid guessing first: it undermines every other number on the page, so it
  // is stated before the numbers it undermines.
  if (profile.status === "ok" && profile.rapidGuessRate >= RAPID_GUESS_ALARM) {
    insights.push({
      kind: "RAPID_GUESSING",
      severity: "CRITICAL",
      subjectId,
      headline: `${Math.round(profile.rapidGuessRate)}% of your answers here were clicked too fast to have been read.`,
      detail:
        "Those answers still count toward your mastery, so the figures on this page are flattering you. Slow down and the numbers start telling the truth.",
    });
  }

  // Needs work is already ordered by leverage, so the first two are the two
  // that matter most. Naming more than two turns advice into a backlog.
  for (const topic of groups.NEEDS_WORK.slice(0, 2)) {
    const isBottleneck = topic.category === "BOTTLENECK";
    insights.push({
      kind: isBottleneck ? "BOTTLENECK_TOPIC" : "WEAK_TOPIC",
      severity: isBottleneck ? "CRITICAL" : "WARNING",
      subjectId,
      topicId: topic.topicId,
      headline: isBottleneck
        ? `${topic.title} is holding up other topics you need.`
        : `${topic.title} is your weakest topic here, at ${Math.round(topic.mastery)}% mastery.`,
      action: {
        label: "Practise this topic",
        href: `/practice/past-questions?topic=${topic.slug}`,
      },
    });
  }

  if (groups.NEEDS_REVISION.length > 0) {
    const first = groups.NEEDS_REVISION[0];
    insights.push({
      kind: "DECAYED_TOPIC",
      severity: "WARNING",
      subjectId,
      topicId: first.topicId,
      headline:
        groups.NEEDS_REVISION.length === 1
          ? `You knew ${first.title} and it has faded — worth revising before the exam.`
          : `You knew ${first.title} and it has faded — ${groups.NEEDS_REVISION.length} topics here need revision.`,
      action: {
        label: "Revise",
        href: `/classroom/${subjectSlug}/${first.slug}`,
      },
    });
  }

  const stale = groups.SOLID.filter((topic) => topic.stale);
  if (stale.length > 0) {
    insights.push({
      kind: "STALE_TOPIC",
      severity: "INFO",
      subjectId,
      topicId: stale[0].topicId,
      headline:
        stale.length === 1
          ? `1 strong topic here hasn't been touched in a while.`
          : `${stale.length} strong topics here haven't been touched in a while.`,
      detail: "Still solid, but worth a quick review before the exam.",
    });
  }

  if (groups.UNPROVEN.length > 0) {
    insights.push({
      kind: "INSUFFICIENT_EVIDENCE",
      severity: "INFO",
      subjectId,
      headline: `${plural(groups.UNPROVEN.length, "topic")} here you haven't proven yet — not weaknesses, unknowns.`,
      action: { label: "Open the classroom", href: `/classroom/${subjectSlug}` },
    });
  }

  if (profile.status === "ok" && profile.pacing) {
    if (profile.pacing.verdict === "SLOW") {
      insights.push({
        kind: "PACING_SLOW",
        severity: "WARNING",
        subjectId,
        headline: `You're taking about ${Math.round(profile.pacing.ratio * 100)}% of the expected time per question here.`,
        detail:
          "Accuracy without speed still fails a timed paper. Practise against the clock.",
      });
    } else if (profile.pacing.verdict === "RUSHED") {
      insights.push({
        kind: "PACING_RUSHED",
        severity: "WARNING",
        subjectId,
        headline: `You're answering well under the expected time per question here.`,
        detail: "Going faster than the paper requires usually costs marks it needn't.",
      });
    }
  }

  // The win comes last so it never crowds out a finding, and selectInsights
  // keeps at most one of them anyway.
  if (
    groups.NEEDS_WORK.length === 0 &&
    groups.NEEDS_REVISION.length === 0 &&
    groups.SOLID.length > 0
  ) {
    insights.push({
      kind: "SUBJECT_STRENGTH",
      severity: "WIN",
      subjectId,
      headline: `No gaps here — ${plural(groups.SOLID.length, "topic")} at target and nothing weak.`,
    });
  }

  return insights;
}
