import Link from "next/link";
import { LuCompass, LuFlame, LuLockOpen } from "react-icons/lu";
import type { NextTopicRecommendation } from "@/engines/learning/recommend";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { evidenceLabel } from "@/lib/evidence-display";

export interface SubjectMeta {
  slug: string;
  name: string;
  code: string;
}

function reasonVariant(
  reason: string,
): "purple" | "blue" | "amber" | "neutral" {
  if (reason.startsWith("Unlocks")) return "purple";
  if (reason.startsWith("High-yield")) return "blue";
  if (reason.startsWith("Fading") || reason.startsWith("Consolidate")) {
    return "amber";
  }
  return "neutral";
}

function reasonIcon(reason: string) {
  if (reason.startsWith("Unlocks")) return <LuLockOpen className="h-3 w-3" />;
  if (reason.startsWith("Fading") || reason.startsWith("Consolidate")) {
    return <LuFlame className="h-3 w-3" />;
  }
  return <LuCompass className="h-3 w-3" />;
}

export function NextTopics({
  items,
  subjects,
}: {
  items: NextTopicRecommendation[];
  subjects: Record<string, SubjectMeta>;
}) {
  if (items.length === 0) return null;

  return (
    <ul className="space-y-3">
      {items.map((item) => {
        const subject = subjects[item.subjectId];
        const inner = (
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
              <LuCompass className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-foreground">
                {item.title}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                {subject && (
                  <span className="text-xs font-medium text-muted">
                    {subject.code} · {subject.name}
                  </span>
                )}
                <Badge variant={reasonVariant(item.reason)}>
                  {reasonIcon(item.reason)}
                  {item.reason}
                </Badge>
                <span className="text-xs text-muted">
                  {evidenceLabel(item) ?? `${item.mastery}% mastery`}
                </span>
              </div>
            </div>
          </div>
        );

        if (!subject || !item.slug) {
          return (
            <li key={item.topicId} className="card p-4">
              {inner}
            </li>
          );
        }

        return (
          <li key={item.topicId}>
            <Link
              href={`/classroom/${subject.slug}/${item.slug}`}
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
