"use client";

import Link from "next/link";
import { useState } from "react";
import { LuCheck, LuRotateCcw, LuSkipForward } from "react-icons/lu";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ACTIVITY_LABELS, planItemHref } from "@/lib/study-plan-display";
import type { StudyPlanItemData } from "@/lib/study-plan";

const TONE: Record<string, "blue" | "green" | "purple" | "amber" | "red"> = {
  LESSON: "blue",
  PRACTICE: "green",
  REVISION: "purple",
  PAST_QUESTIONS: "amber",
  MOCK_EXAM: "red",
};

function weekdayName(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" });
}

export function PlanItemRow({
  item,
  onStatus,
}: {
  item: StudyPlanItemData;
  onStatus: (id: string, status: "COMPLETED" | "SKIPPED" | "PENDING") => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const done = item.status === "COMPLETED";
  const skipped = item.status === "SKIPPED";
  const missed = item.status === "MISSED";

  async function change(status: "COMPLETED" | "SKIPPED" | "PENDING") {
    setBusy(true);
    try {
      await onStatus(item.id, status);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-xl border px-3 py-2.5",
        done ? "border-tone-green-line bg-tone-green-soft/70" : "border-border bg-secondary/30",
        (skipped || missed) && "opacity-70",
      )}
    >
      <Badge variant={done ? "green" : (TONE[item.activityType] ?? "neutral")}>
        {ACTIVITY_LABELS[item.activityType] ?? item.activityType}
      </Badge>
      <div className="min-w-0 flex-1">
        <p className={cn("truncate text-sm font-semibold", done ? "text-tone-green-ink" : "text-foreground")}>
          {item.subject.code || item.subject.name}
          {item.topicTitle ? ` — ${item.topicTitle}` : ""}
        </p>
        <p className="truncate text-xs text-muted">
          {item.durationMinutes} min
          {item.notes ? ` · ${item.notes}` : ""}
          {item.carriedFrom ? ` · Moved from ${weekdayName(item.carriedFrom)}` : ""}
          {done && item.completionSource === "AUTO" ? " · Done automatically" : ""}
          {skipped ? " · Skipped" : ""}
          {missed ? " · Missed" : ""}
        </p>
      </div>
      <div className="flex items-center gap-1">
        {!done && !skipped && (
          <Link href={planItemHref(item)} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10">
            Open
          </Link>
        )}
        {done || skipped ? (
          <button type="button" disabled={busy} onClick={() => change("PENDING")}
            className="rounded-lg p-1.5 text-muted hover:bg-secondary" aria-label="Undo">
            <LuRotateCcw className="h-4 w-4" />
          </button>
        ) : (
          <>
            <button type="button" disabled={busy} onClick={() => change("COMPLETED")}
              className="rounded-lg p-1.5 text-success hover:bg-success/10" aria-label="Mark done">
              <LuCheck className="h-4 w-4" />
            </button>
            {!missed && (
              <button type="button" disabled={busy} onClick={() => change("SKIPPED")}
                className="rounded-lg p-1.5 text-muted hover:bg-secondary" aria-label="Skip">
                <LuSkipForward className="h-4 w-4" />
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
