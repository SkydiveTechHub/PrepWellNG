import { TERM_LABELS, type Term } from "../../lib/curriculum-scope";
import { addDays, daysBetween, mondayOf, type DayKey } from "./days";

// Where today sits in the school calendar. Admins configure the terms; when they
// have not (or the configured calendar is stale), an approximate national
// calendar keeps plans working instead of failing.

export type TermRange = {
  session: string;
  term: Term;
  startsOn: DayKey;
  endsOn: DayKey;
};

export type TermSource = "configured" | "fallback";

export type TermContext =
  | {
      kind: "in_term";
      source: TermSource;
      current: TermRange;
      weekOfTerm: number;
      totalWeeks: number;
      weeksLeft: number;
    }
  | {
      kind: "holiday";
      source: TermSource;
      previous: TermRange | null;
      next: TermRange | null;
    };

/** A configured term this close to today means the calendar is being kept up. */
const COVERAGE_DAYS = 60;

/** The approximate national calendar for the sessions either side of today. */
export function fallbackTerms(today: DayKey): TermRange[] {
  const year = Number(today.slice(0, 4));
  const ranges: TermRange[] = [];
  for (const y of [year - 1, year]) {
    const session = `${y}/${y + 1}`;
    ranges.push(
      { session, term: "FIRST", startsOn: `${y}-09-08`, endsOn: `${y}-12-15` },
      { session, term: "SECOND", startsOn: `${y + 1}-01-06`, endsOn: `${y + 1}-04-10` },
      { session, term: "THIRD", startsOn: `${y + 1}-04-27`, endsOn: `${y + 1}-07-24` },
    );
  }
  return ranges;
}

function near(term: TermRange, today: DayKey, days: number): boolean {
  return (
    daysBetween(today, term.startsOn) <= days &&
    daysBetween(term.endsOn, today) <= days
  );
}

export function resolveTermContext(
  today: DayKey,
  configured: readonly TermRange[],
): TermContext {
  const covered = configured.some((term) => near(term, today, COVERAGE_DAYS));
  const source: TermSource = covered ? "configured" : "fallback";
  const terms = (covered ? [...configured] : fallbackTerms(today)).sort((a, b) =>
    a.startsOn.localeCompare(b.startsOn),
  );

  const current = terms.find((t) => t.startsOn <= today && today <= t.endsOn);
  if (current) {
    const firstMonday = mondayOf(current.startsOn);
    const totalWeeks = Math.floor(daysBetween(firstMonday, current.endsOn) / 7) + 1;
    const weekOfTerm = Math.floor(daysBetween(firstMonday, today) / 7) + 1;
    return {
      kind: "in_term",
      source,
      current,
      weekOfTerm,
      totalWeeks,
      weeksLeft: totalWeeks - weekOfTerm,
    };
  }

  const previous = [...terms].reverse().find((t) => t.endsOn < today) ?? null;
  const next = terms.find((t) => t.startsOn > today) ?? null;
  return { kind: "holiday", source, previous, next };
}

function termName(range: TermRange): string {
  return `${range.session} ${TERM_LABELS[range.term]}`;
}

/** Human-readable problems with a set of terms; empty when they are consistent. */
export function validateTermRanges(ranges: readonly TermRange[]): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();

  for (const range of ranges) {
    const match = /^(\d{4})\/(\d{4})$/.exec(range.session);
    if (!match || Number(match[2]) !== Number(match[1]) + 1) {
      errors.push(`${range.session}: a session looks like 2026/2027.`);
    }
    if (range.endsOn <= range.startsOn) {
      errors.push(`${termName(range)}: the end date must be after the start date.`);
    }
    const key = `${range.session}:${range.term}`;
    if (seen.has(key)) errors.push(`${termName(range)} is already set.`);
    seen.add(key);
  }

  const sorted = [...ranges].sort((a, b) => a.startsOn.localeCompare(b.startsOn));
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].startsOn <= sorted[i - 1].endsOn) {
      errors.push(`${termName(sorted[i])} overlaps ${termName(sorted[i - 1])}.`);
    }
  }
  return errors;
}

/** Whether a configured term covers any day from today through `aheadDays` from now. */
export function hasTermCoverage(
  configured: readonly TermRange[],
  today: DayKey,
  aheadDays = 30,
): boolean {
  const until = addDays(today, aheadDays);
  return configured.some((t) => t.startsOn <= until && t.endsOn >= today);
}

export function termHeaderLabel(ctx: TermContext): string {
  if (ctx.kind === "in_term") {
    return `${TERM_LABELS[ctx.current.term]} · Week ${ctx.weekOfTerm} of ${ctx.totalWeeks}`;
  }
  return ctx.previous
    ? `Holiday — revising ${TERM_LABELS[ctx.previous.term]}`
    : "Holiday";
}
