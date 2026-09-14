import { lagosDayKey } from "../../lib/streak";
import type { TrackedItem } from "./completion";
import { addDays, type DayKey } from "./days";
import type { CompletedUnits, FixedItem } from "./layout";
import type { CarryOver } from "./topics";

export const CARRY_OVER_DAYS = 14;

export type ExistingItem = TrackedItem & { durationMinutes: number };

export type ReplanPartition = {
  /** Pending sessions whose day has passed. */
  markMissed: string[];
  /** Pending sessions today or later: regenerated from scratch. */
  deletePending: string[];
  /** Completed or skipped sessions today or later: they keep their time. */
  fixed: FixedItem[];
  /** Recently missed topics, one entry per topic, dated its latest miss. */
  carryOver: CarryOver[];
};

/** A plan's LESSON/PRACTICE sessions that are COMPLETED or SKIPPED, grouped by topic and type. */
export type CompletedUnitRow = {
  topicId: string;
  activityType: "LESSON" | "PRACTICE";
  count: number;
  /** The latest scheduled date in the group. */
  lastDate: DayKey | null;
};

export function completedUnitsFrom(rows: readonly CompletedUnitRow[]): Map<string, CompletedUnits> {
  const out = new Map<string, CompletedUnits>();
  for (const row of rows) {
    const done = out.get(row.topicId) ?? { lessons: 0, practices: 0, lastLessonDate: null };
    if (row.activityType === "LESSON") {
      done.lessons += row.count;
      if (row.lastDate && (done.lastLessonDate === null || row.lastDate > done.lastLessonDate)) {
        done.lastLessonDate = row.lastDate;
      }
    } else {
      done.practices += row.count;
    }
    out.set(row.topicId, done);
  }
  return out;
}

export function isReplanStale(lastReplannedAt: Date | null, now: Date): boolean {
  return lastReplannedAt === null || lagosDayKey(lastReplannedAt) < lagosDayKey(now);
}

export function partitionForReplan(items: readonly ExistingItem[], today: DayKey): ReplanPartition {
  const markMissed: string[] = [];
  const deletePending: string[] = [];
  const fixed: FixedItem[] = [];
  const latestMiss = new Map<string, CarryOver>();
  const carryFrom = addDays(today, -CARRY_OVER_DAYS);

  const sorted = [...items].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  for (const item of sorted) {
    const pastPending = item.status === "PENDING" && item.date < today;
    if (pastPending) markMissed.push(item.id);
    else if (item.status === "PENDING") deletePending.push(item.id);
    else if (item.status !== "MISSED" && item.date >= today) {
      fixed.push({ date: item.date, subjectId: item.subjectId, durationMinutes: item.durationMinutes });
    }

    const missed = pastPending || item.status === "MISSED";
    if (missed && item.topicId && item.date >= carryFrom) {
      const previous = latestMiss.get(item.topicId);
      if (!previous || previous.missedOn < item.date) {
        latestMiss.set(item.topicId, { topicId: item.topicId, subjectId: item.subjectId, missedOn: item.date });
      }
    }
  }

  const carryOver = [...latestMiss.values()].sort(
    (a, b) => a.missedOn.localeCompare(b.missedOn) || a.topicId.localeCompare(b.topicId),
  );
  return { markMissed, deletePending, fixed, carryOver };
}
