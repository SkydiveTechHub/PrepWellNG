import Link from "next/link";
import {
  LuCalendarClock,
  LuFlame,
  LuLayers,
  LuRotateCcw,
} from "react-icons/lu";
import type { RevisionQueueItem } from "@/engines/learning/revision";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { SubjectMeta } from "./next-topics";

function reasonVariant(
  reason: string,
): "orange" | "purple" | "blue" | "neutral" {
  if (reason.startsWith("Retention")) return "orange";
  if (reason.includes("cards due")) return "purple";
  return "blue";
}

function reasonIcon(reason: string) {
  if (reason.startsWith("Retention")) return <LuFlame className="h-3 w-3" />;
  if (reason.includes("cards due")) return <LuLayers className="h-3 w-3" />;
  return <LuCalendarClock className="h-3 w-3" />;
}

export function RevisionQueue({
  items,
  subjects,
}: {
  items: RevisionQueueItem[];
  subjects: Record<string, SubjectMeta>;
}) {
  if (items.length === 0) return null;

  return (
    <ul className="space-y-3">
      {items.map((item) => {
        const subject = subjects[item.subjectId];
        const inner = (
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-orange-100 text-orange-700">
              <LuRotateCcw className="h-5 w-5" />
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
                {item.retention != null && (
                  <span className="text-xs text-muted">
                    {Math.round(item.retention * 100)}% recall
                  </span>
                )}
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
              href={`/subjects/${subject.slug}/${item.slug}`}
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
