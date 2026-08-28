import Link from "next/link";
import type { Insight } from "@/engines/analytics/insight";

const TONE: Record<Insight["severity"], string> = {
  CRITICAL: "border-danger/30 bg-danger-soft",
  WARNING: "border-warning/30 bg-warning-soft",
  INFO: "border-border bg-secondary/40",
  WIN: "border-success/30 bg-success-soft",
};

export function InsightList({ insights }: { insights: Insight[] }) {
  if (insights.length === 0) return null;

  return (
    <ul className="mt-6 space-y-2.5">
      {insights.map((insight, index) => (
        <li
          key={`${insight.kind}-${insight.topicId ?? index}`}
          className={`rounded-2xl border p-4 ${TONE[insight.severity]}`}
        >
          <p className="text-sm font-semibold text-foreground">{insight.headline}</p>
          {insight.detail && (
            <p className="mt-1 text-xs leading-relaxed text-muted">{insight.detail}</p>
          )}
          {insight.action && (
            <Link
              href={insight.action.href}
              className="mt-2 inline-block text-xs font-bold text-primary hover:underline"
            >
              {insight.action.label} →
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}
