import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { evidenceLabel } from "@/lib/evidence-display";
import type { TopicGroupKey, TopicRow } from "@/engines/analytics/topic-groups";

/**
 * Where a row sends the student depends on what the group means. A measured
 * weakness is fixed by practice; an unproven or faded topic is fixed by going
 * back to the lesson. See the spec §4.
 */
function rowHref(group: TopicGroupKey, subjectSlug: string, topicSlug: string): string {
  return group === "NEEDS_WORK" || group === "COMING_ALONG"
    ? `/practice/past-questions?topic=${topicSlug}`
    : `/classroom/${subjectSlug}/${topicSlug}`;
}

/**
 * A card stack that becomes a grid from sm: up. Never a table — a horizontally
 * scrolling table is not an acceptable phone experience.
 *
 * <details> rather than a client component: collapsing needs no JavaScript, so
 * this stays a server component and ships none.
 */
export function TopicGroupList({
  title,
  blurb,
  rows,
  group,
  subjectSlug,
  defaultOpen = false,
}: {
  title: string;
  blurb: string;
  rows: TopicRow[];
  group: TopicGroupKey;
  subjectSlug: string;
  defaultOpen?: boolean;
}) {
  if (rows.length === 0) return null;

  return (
    <details open={defaultOpen} className="card mt-4 overflow-hidden">
      <summary className="cursor-pointer list-none p-5">
        <span className="flex items-center justify-between gap-3">
          <span>
            <span className="block text-sm font-bold text-foreground">{title}</span>
            <span className="mt-0.5 block text-xs text-muted">{blurb}</span>
          </span>
          <Badge variant="blue">{rows.length}</Badge>
        </span>
      </summary>

      <ul className="grid grid-cols-1 gap-2 border-t border-border bg-secondary/20 p-4 sm:grid-cols-2">
        {rows.map((row) => {
          const fallback = evidenceLabel({
            confidence: row.confidence,
            accObservations: row.accObservations,
            lessonObservations: row.lessonObservations,
            srsObservations: row.srsObservations,
            lastStudy: row.lastStudy,
          });
          return (
            <li key={row.topicId}>
              <Link
                href={rowHref(group, subjectSlug, row.slug)}
                className="block rounded-xl border border-border bg-card p-3 transition-colors hover:border-primary/30"
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs font-semibold text-foreground">
                    {row.title}
                  </span>
                  {row.stale && <Badge variant="amber">Stale</Badge>}
                </span>
                {fallback ? (
                  <span className="mt-1.5 block text-xs text-muted">{fallback}</span>
                ) : row.observations === 0 ? (
                  // No evidence at all. A "0% mastery" bar here reads as a
                  // measured weakness; this row is an unknown, not a failure.
                  <span className="mt-1.5 block text-xs text-muted">Not started yet</span>
                ) : (
                  <>
                    <span className="mt-1.5 block text-xs text-muted">
                      {/* accObservations, not observations: lesson checkpoints and
                          card reviews are evidence, but they were not answered. */}
                      {Math.round(row.mastery)}% mastery · {row.accObservations} answered
                    </span>
                    <span className="mt-1.5 block">
                      <Progress value={Math.round(row.mastery)} tone="auto" />
                    </span>
                  </>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </details>
  );
}
