"use client";

import { Badge } from "@/components/ui/badge";
import { groupWindow } from "@/lib/study-plan-display";
import type { StudyPlanData, StudyPlanItemData } from "@/lib/study-plan";
import { PlanItemRow } from "./plan-item-row";

type OnStatus = (id: string, status: "COMPLETED" | "SKIPPED" | "PENDING") => Promise<void>;

function dayTitle(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "short", day: "numeric", month: "short", timeZone: "UTC",
  });
}

function DayList({ title, days, onStatus }: { title: string; days: { date: string; items: StudyPlanItemData[] }[]; onStatus: OnStatus }) {
  if (days.length === 0) return null;
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-bold uppercase tracking-wider text-muted">{title}</h2>
      {days.map((day) => {
        const done = day.items.filter((i) => i.status === "COMPLETED").length;
        const catchUp = day.items.some((i) => i.carriedFrom);
        return (
          <div key={day.date} className="card p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-bold text-foreground">{dayTitle(day.date)}</span>
              <div className="flex gap-2">
                {catchUp && <Badge variant="amber">Catch-up</Badge>}
                <Badge variant={done === day.items.length ? "green" : "neutral"}>{done}/{day.items.length}</Badge>
              </div>
            </div>
            <div className="space-y-2">
              {day.items.map((item) => <PlanItemRow key={item.id} item={item} onStatus={onStatus} />)}
            </div>
          </div>
        );
      })}
    </section>
  );
}

export function PlanSchedule({ plan, today, onStatus }: { plan: StudyPlanData; today: string; onStatus: OnStatus }) {
  const groups = groupWindow(plan.items, today);
  const todayDone = groups.today.filter((i) => i.status === "COMPLETED").length;

  return (
    <div className="space-y-8">
      <section className="card p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold tracking-tight text-foreground">Today</h2>
          {groups.today.length > 0 && (
            <span className="text-sm font-semibold text-muted">{todayDone} of {groups.today.length} done</span>
          )}
        </div>
        {groups.today.length === 0 ? (
          <p className="text-sm text-muted">Nothing planned today — rest, or get ahead from this week&apos;s list.</p>
        ) : (
          <div className="space-y-2">
            {groups.today.map((item) => <PlanItemRow key={item.id} item={item} onStatus={onStatus} />)}
          </div>
        )}
      </section>

      {groups.recentMissed.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted">Missed this week</h2>
          <p className="text-xs text-muted">These have been moved to your next free slots. Studied offline? Tick them off.</p>
          {groups.recentMissed.map((item) => <PlanItemRow key={item.id} item={item} onStatus={onStatus} />)}
        </section>
      )}

      <DayList title="This week" days={groups.thisWeek} onStatus={onStatus} />
      <DayList title="Next week" days={groups.nextWeek} onStatus={onStatus} />

      {plan.outline.length > 0 && (
        <details className="card p-5">
          <summary className="cursor-pointer text-sm font-bold text-foreground">Rest of the plan</summary>
          <ul className="mt-4 space-y-3">
            {plan.outline.map((week) => (
              <li key={week.weekStart} className="text-sm">
                <span className="font-semibold text-foreground">Week of {dayTitle(week.weekStart)}</span>
                <span className="text-muted">
                  {" — "}
                  {week.label ?? (week.topics.map((t) => t.title).join(", ") || "Revision")}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
