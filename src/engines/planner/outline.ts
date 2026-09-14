import { addDays, daysBetween, mondayOf, type DayKey } from "./days";
import type { PlanMode } from "./mode";
import type { TermContext } from "./term-context";
import type { SubjectSelection } from "./topics";

export type OutlineWeek = {
  weekStart: DayKey;
  label: string | null;
  topics: { subjectId: string; title: string }[];
};

/** Keeps the page and the stored JSON small for a plan months from its exam. */
const MAX_OUTLINE_WEEKS = 20;

/** A rough week-by-week view after the detailed window: where the class will be. */
export function projectOutline(input: {
  today: DayKey;
  from: DayKey;
  until: DayKey | null;
  mode: PlanMode;
  runwayStart: DayKey | null;
  termContext: TermContext;
  selections: readonly SubjectSelection[];
}): OutlineWeek[] {
  if (!input.until || input.from > input.until) return [];
  const ctx = input.termContext;
  const weeks: OutlineWeek[] = [];

  for (
    let weekStart = mondayOf(input.from);
    weekStart <= input.until && weeks.length < MAX_OUTLINE_WEEKS;
    weekStart = addDays(weekStart, 7)
  ) {
    if (input.runwayStart && weekStart >= mondayOf(input.runwayStart)) {
      weeks.push({ weekStart, label: "Exam runway — mocks and past questions", topics: [] });
      continue;
    }
    if (input.mode === "EXAM") {
      weeks.push({ weekStart, label: "Exam revision", topics: [] });
      continue;
    }
    if (ctx.kind !== "in_term" || weekStart > ctx.current.endsOn) {
      weeks.push({ weekStart, label: "Next term — topics follow the school calendar", topics: [] });
      continue;
    }

    const weeksAhead = Math.floor(daysBetween(mondayOf(input.today), weekStart) / 7);
    const topics = input.selections.flatMap((selection) => {
      const count = selection.termTopics.length;
      if (count === 0 || selection.classIndex < 0) return [];
      const pace = count / ctx.totalWeeks;
      const index = Math.min(count - 1, selection.classIndex + Math.floor(weeksAhead * pace));
      return [{ subjectId: selection.subjectId, title: selection.termTopics[index].title }];
    });
    weeks.push({ weekStart, label: null, topics });
  }
  return weeks;
}
