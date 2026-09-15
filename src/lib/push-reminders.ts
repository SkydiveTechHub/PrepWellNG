// What the morning and evening reminders say, and who gets the evening one.
// Pure — no database — so the copy and the streak rule are tested directly.

import { BODY_MAX, truncate } from "@/lib/push-payload";
import { currentStreak, previousDayKey } from "@/lib/streak";

export type ReminderKind = "morning" | "streak";

export type ReminderMessage = { title: string; body: string; url: string };

export type DigestPlanItem = {
  topicName: string | null;
  subjectName: string;
  durationMinutes: number;
};

export const REMINDER_PAGE_SIZE = 200;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function buildMorningDigest(input: {
  planItems: DigestPlanItem[];
  dueCards: number;
}): ReminderMessage | null {
  const { planItems, dueCards } = input;
  const minutes = planItems.reduce((sum, i) => sum + i.durationMinutes, 0);

  if (planItems.length > 0 && dueCards > 0) {
    return {
      title: "Today's study plan",
      body: `Today: ${plural(planItems.length, "topic", "topics")} · ${minutes} min, and ${plural(dueCards, "flashcard", "flashcards")} due`,
      url: "/study-plan",
    };
  }

  if (planItems.length > 0) {
    const first = planItems[0];
    const more = planItems.length > 1 ? ` + ${planItems.length - 1} more` : "";
    const suffix = `${more} (${minutes} min)`;
    const prefix = "Today's plan: ";
    const label = truncate(first.topicName ?? first.subjectName, BODY_MAX - prefix.length - suffix.length);
    return { title: "Today's study plan", body: `${prefix}${label}${suffix}`, url: "/study-plan" };
  }

  if (dueCards > 0) {
    return {
      title: "Flashcards due",
      body: `${plural(dueCards, "flashcard", "flashcards")} ${dueCards === 1 ? "is" : "are"} due for review`,
      url: "/flashcards",
    };
  }

  return null;
}

/**
 * The streak to mention tonight, or null for no reminder. Uses the same
 * currentStreak() as the achievements badge so the numbers agree.
 */
export function streakToRemind(dayKeys: Iterable<string>, today: string): number | null {
  const days = new Set(dayKeys);
  if (days.has(today)) return null;
  const streak = currentStreak(days, previousDayKey(today));
  return streak >= 2 ? streak : null;
}

export function buildStreakReminder(streak: number): ReminderMessage {
  return {
    title: "Keep your streak going",
    body: `Keep your ${streak}-day streak: one quick practice before midnight`,
    url: "/practice",
  };
}

const HOUR_MS = 60 * 60 * 1000;

/** Lagos is UTC+1 all year: a Lagos day starts at 23:00 UTC the day before. */
export function lagosDayStart(dayKey: string): Date {
  const [y, m, d] = dayKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) - HOUR_MS);
}

export function lagosDayEnd(dayKey: string): Date {
  return new Date(lagosDayStart(dayKey).getTime() + 24 * HOUR_MS);
}

/** StudyPlanItem.scheduledDate is @db.Date, stored as UTC midnight of the civil day. */
export function planDateFor(dayKey: string): Date {
  return new Date(`${dayKey}T00:00:00.000Z`);
}
