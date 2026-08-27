import Link from "next/link";
import { LuFlame, LuLink2, LuCircleSlash, LuTriangleAlert } from "react-icons/lu";
import type { TopicGap } from "@/engines/learning/gaps";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { evidenceLabel } from "@/lib/evidence-display";
import type { SubjectMeta } from "./next-topics";

function gapLabel(gap: TopicGap): string {
  if (gap.category === "BOTTLENECK") {
    return `Blocks ${gap.blockedCount} topic${gap.blockedCount === 1 ? "" : "s"}`;
  }
  if (gap.category === "DECAYED") return "Fading fast";
  if (gap.category === "ABANDONED") return "Started without finishing";
  return "Weak";
}

function gapVariant(
  gap: TopicGap,
): "red" | "amber" | "orange" | "neutral" {
  if (gap.category === "BOTTLENECK") return "red";
  if (gap.category === "DECAYED") return "orange";
  if (gap.category === "ABANDONED") return "neutral";
  return "amber";
}

function gapIcon(gap: TopicGap) {
  if (gap.category === "BOTTLENECK") {
    return <LuLink2 className="h-3 w-3" />;
  }
  if (gap.category === "DECAYED") return <LuFlame className="h-3 w-3" />;
  if (gap.category === "ABANDONED") return <LuCircleSlash className="h-3 w-3" />;
  return <LuTriangleAlert className="h-3 w-3" />;
}

export function GapList({
  items,
  subjects,
}: {
  items: TopicGap[];
  subjects: Record<string, SubjectMeta>;
}) {
  if (items.length === 0) return null;

  return (
    <ul className="space-y-3">
      {items.map((gap) => {
        const subject = subjects[gap.subjectId];
        const inner = (
          <div className="flex min-w-0 items-center gap-3">
            <span
              className={cn(
                "flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl",
                gap.category === "BOTTLENECK"
                  ? "bg-tone-red-soft text-tone-red-ink"
                  : gap.category === "DECAYED"
                    ? "bg-tone-orange-soft text-tone-orange-ink"
                    : gap.category === "ABANDONED"
                      ? "bg-secondary text-secondary-foreground"
                      : "bg-tone-amber-soft text-tone-amber-ink",
              )}
            >
              <LuTriangleAlert className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-foreground">
                {gap.title}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                {subject && (
                  <span className="text-xs font-medium text-muted">
                    {subject.code} · {subject.name}
                  </span>
                )}
                <Badge variant={gapVariant(gap)}>
                  {gapIcon(gap)}
                  {gapLabel(gap)}
                </Badge>
                <span className="text-xs text-muted">
                  {evidenceLabel(gap) ?? `${gap.mastery}% mastery`}
                </span>
                {gap.abandonedCount > 0 && (
                  <span className="text-xs text-muted">
                    Started {gap.abandonedCount}{" "}
                    {gap.abandonedCount === 1 ? "time" : "times"} without finishing
                  </span>
                )}
              </div>
            </div>
          </div>
        );

        if (!subject || !gap.slug) {
          return (
            <li key={gap.topicId} className="card p-4">
              {inner}
            </li>
          );
        }

        return (
          <li key={gap.topicId}>
            <Link
              href={`/classroom/${subject.slug}/${gap.slug}`}
              className={cn(
                "card card-interactive group block p-4 transition-opacity",
                "hover:opacity-90",
              )}
            >
              {inner}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
