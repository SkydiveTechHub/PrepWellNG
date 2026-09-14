import { addDays, mondayOf } from "@/engines/planner/days";

// Pure helpers for the study plan page. No React, no database.

export const ACTIVITY_LABELS: Record<string, string> = {
  LESSON: "Lesson",
  PRACTICE: "Practice",
  REVISION: "Revision",
  PAST_QUESTIONS: "Past questions",
  MOCK_EXAM: "Mock exam",
};

/** The page where doing the session also marks it done. */
export function planItemHref(item: {
  activityType: string;
  topicSlug: string | null;
  subject: { slug: string };
}): string {
  const topic = item.topicSlug ? `/classroom/${item.subject.slug}/${item.topicSlug}` : null;
  switch (item.activityType) {
    case "LESSON":
      return topic ? `${topic}/study` : `/classroom/${item.subject.slug}`;
    case "PRACTICE":
      return topic ? `${topic}/practice` : `/classroom/${item.subject.slug}`;
    case "REVISION":
      return topic ? `${topic}/quiz` : "/flashcards";
    case "PAST_QUESTIONS":
      return `/practice/past-questions/${item.subject.slug}`;
    case "MOCK_EXAM":
      return "/practice/mock-exam";
    default:
      return "/study-plan";
  }
}

type Day<T> = { date: string; items: T[] };

function byDay<T extends { date: string }>(items: readonly T[]): Day<T>[] {
  const days = new Map<string, T[]>();
  for (const item of items) days.set(item.date, [...(days.get(item.date) ?? []), item]);
  return [...days.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, list]) => ({ date, items: list }));
}

export function groupWindow<T extends { date: string; status: string }>(
  items: readonly T[],
  today: string,
) {
  const nextMonday = addDays(mondayOf(today), 7);
  const followingMonday = addDays(nextMonday, 7);
  return {
    today: items.filter((i) => i.date === today),
    recentMissed: items.filter((i) => i.date < today && i.status === "MISSED"),
    thisWeek: byDay(items.filter((i) => i.date > today && i.date < nextMonday)),
    nextWeek: byDay(items.filter((i) => i.date >= nextMonday && i.date < followingMonday)),
  };
}
