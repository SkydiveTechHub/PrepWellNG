// The finding every analytics view emits alongside its display data.
//
// Today these render as sentences. Later a recommendation engine consumes the
// same array and turns it into StudyPlanItems — which is why the engines emit
// structured findings rather than formatted strings, and why `headline` is a
// whole sentence rather than a fragment a caller has to assemble.
// See docs/superpowers/specs/2026-08-28-performance-analytics-design.md §9.

export type InsightSeverity = "CRITICAL" | "WARNING" | "INFO" | "WIN";

export type InsightKind =
  | "UNTOUCHED_SUBJECT"
  | "LOW_COVERAGE"
  | "WEAK_TOPIC"
  | "DECAYED_TOPIC"
  | "STALE_TOPIC"
  | "BOTTLENECK_TOPIC"
  | "RAPID_GUESSING"
  | "PACING_SLOW"
  | "PACING_RUSHED"
  | "DIFFICULTY_DRIFT"
  | "IMPROVING"
  | "PLATEAU"
  | "SLIPPING"
  | "INSUFFICIENT_EVIDENCE"
  | "LOW_CONSISTENCY"
  | "SUBJECT_STRENGTH"
  | "EXAM_RULE_VIOLATION"
  | "COURSE_REQUIREMENT_RISK";

export type Insight = {
  kind: InsightKind;
  severity: InsightSeverity;
  subjectId?: string;
  topicId?: string;
  /** One plain sentence. This is the text that renders — no assembly by callers. */
  headline: string;
  detail?: string;
  action?: { label: string; href: string };
};

export const SEVERITY_RANK: Record<InsightSeverity, number> = {
  CRITICAL: 0,
  WARNING: 1,
  INFO: 2,
  WIN: 3,
};

/**
 * The insights worth showing, most severe first.
 *
 * At most one WIN survives. A page that congratulates a student twice while
 * they still have gaps reads as noise, and the WIN exists only so the section
 * is not an unbroken list of failings.
 *
 * The sort is stable, so producers control the order within a severity and can
 * express "this weak topic matters more than that one" by emitting it first.
 */
export function selectInsights(
  insights: readonly Insight[],
  limit = 3,
): Insight[] {
  let winsKept = 0;
  return [...insights]
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
    .filter((insight) => {
      if (insight.severity !== "WIN") return true;
      winsKept += 1;
      return winsKept === 1;
    })
    .slice(0, limit);
}
