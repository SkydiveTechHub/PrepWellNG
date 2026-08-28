import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { evidenceLabel } from "@/lib/evidence-display";
import type { TopicRow } from "@/engines/analytics/topic-groups";

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
  subjectSlug,
  defaultOpen = false,
}: {
  title: string;
  blurb: string;
  rows: TopicRow[];
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
                href={`/classroom/${subjectSlug}/${row.slug}`}
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
                ) : (
                  <>
                    <span className="mt-1.5 block text-xs text-muted">
                      {Math.round(row.mastery)}% mastery · {row.observations} answered
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
