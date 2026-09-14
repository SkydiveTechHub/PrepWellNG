import { incomingEdges, type KnowledgeGraph } from "../learning/graph";
import type { TopicStateMap } from "../learning/mastery";
import { GATE } from "../learning/availability";
import { MOCK_COUNT, REVISION_OFFSETS, WEAK_MASTERY, type PlanActivityType } from "./plan";
import { addDays, daysBetween, isWeekend, mondayOf, type DayKey } from "./days";
import { SESSION_MINUTES, type Slot } from "./slots";
import { examShare, type PlanMode } from "./mode";
import type { SubjectSelection, TopicCandidate } from "./topics";

// Fills a window of time slots with sessions. Pure and deterministic: the same
// input always yields the same items, in date order.

export type WindowItemDraft = {
  date: DayKey;
  subjectId: string;
  topicId: string | null;
  activityType: PlanActivityType;
  durationMinutes: number;
  notes: string | null;
  carriedFrom: DayKey | null;
};

/** A completed or skipped session already on the calendar; it keeps its time. */
export type FixedItem = { date: DayKey; subjectId: string; durationMinutes: number };

export type RevisionDue = { topicId: string; subjectId: string; title: string; reason: string };

export type Overload = { topicsBehind: number; suggestedExtraMinutesPerWeek: number };

/** A topic's LESSON and PRACTICE sessions already COMPLETED or SKIPPED in this plan. */
export type CompletedUnits = { lessons: number; practices: number; lastLessonDate: DayKey | null };

/** Practice sessions a term topic needs at this mastery. */
export function practicesNeeded(mastery: number): number {
  return mastery < WEAK_MASTERY ? 2 : 1;
}

/**
 * Topics whose lessons have begun but whose practice isn't done. They stay in
 * the plan even once mastery reaches the target, so practice follows the lesson.
 */
export function inProgressTopics(
  completedUnits: ReadonlyMap<string, CompletedUnits>,
  state: TopicStateMap,
): Set<string> {
  const out = new Set<string>();
  for (const [topicId, done] of completedUnits) {
    const mastery = state.get(topicId)?.mastery ?? 0;
    if (done.lessons >= 1 && done.practices < practicesNeeded(mastery)) out.add(topicId);
  }
  return out;
}

export type LayoutInput = {
  mode: PlanMode;
  /** The first day of the window (today); the first slot may fall later. */
  windowStart: DayKey;
  slots: readonly Slot[];
  targetDate: DayKey | null;
  runwayStart: DayKey | null;
  selections: readonly SubjectSelection[];
  examCandidates: readonly TopicCandidate[];
  subjectIds: readonly string[];
  subjectNames: Readonly<Record<string, string>>;
  graph: KnowledgeGraph;
  state: TopicStateMap;
  pretestPassed: ReadonlySet<string>;
  revisionDue: readonly RevisionDue[];
  fixed: readonly FixedItem[];
  /** Runway mocks already COMPLETED or SKIPPED, in planned order; a re-plan drops that many. */
  mocksTaken: number;
  /** topicId → work already done, so a re-plan continues a topic instead of restarting it. */
  completedUnits: ReadonlyMap<string, CompletedUnits>;
};

export const GAP_FILL_SHARE = 0.2;
export const REVISION_SHARE = 0.2;
export const MOCK_MINUTES_CAP = 180;
/** Every third exam slot is a past-questions session. */
const PAST_QUESTIONS_EVERY = 3;

export function subjectCap(date: DayKey): number {
  return isWeekend(date) ? 3 : 2;
}

type Unit = "LESSON" | "PRACTICE";

type Queue = {
  candidate: TopicCandidate;
  exam: boolean;
  /** Position in the candidate lists: the within-subject priority. */
  rank: number;
  units: Unit[];
  lessonsLeft: number;
  lastLessonDate: DayKey | null;
  /** Date its most recently placed unit landed on — used to gate dependents, including exam queues. */
  placedOn: DayKey | null;
  started: boolean;
  /** Its spaced revision passes are already in the pool. */
  revisionsQueued: boolean;
};

type PoolEntry = { dueOn: DayKey; order: number; topicId: string; subjectId: string; note: string };

function groupByDate(slots: readonly Slot[]): [DayKey, Slot[]][] {
  const days = new Map<DayKey, Slot[]>();
  for (const slot of slots) {
    const list = days.get(slot.date) ?? [];
    list.push({ ...slot });
    days.set(slot.date, list);
  }
  return [...days.entries()];
}

/** Drops each day's last slots until that day's fixed minutes are covered. */
function freeDays(slots: readonly Slot[], fixed: readonly FixedItem[]): [DayKey, Slot[]][] {
  const used = new Map<DayKey, number>();
  for (const f of fixed) used.set(f.date, (used.get(f.date) ?? 0) + f.durationMinutes);
  return groupByDate(slots).map(([date, daySlots]) => {
    let remaining = used.get(date) ?? 0;
    while (remaining > 0 && daySlots.length > 0) {
      remaining -= (daySlots.pop() as Slot).minutes;
    }
    return [date, daySlots];
  });
}

function noteFor(candidate: TopicCandidate, unit: Unit): string {
  const title = candidate.topic.title;
  if (candidate.reason === "EXAM") return `Exam prep — practise ${title}`;
  if (unit === "PRACTICE") return `Practise ${title} questions`;
  switch (candidate.reason) {
    case "CARRY_OVER":
      return "Catch-up — from a missed session";
    case "GAP_FILL":
      return candidate.unlocks ? `Foundation for ${candidate.unlocks}` : "Build this foundation first";
    case "CURRENT":
      return "Your class is on this topic now";
    case "CATCH_UP":
      return "Catch up with your class";
    case "PREVIEW":
      return "Get ahead — coming up next in class";
  }
}

export function layoutWindow(input: LayoutInput): {
  items: WindowItemDraft[];
  overload: Overload | null;
} {
  const days = freeDays(input.slots, input.fixed);
  const items: WindowItemDraft[] = [];

  const daySubjects = new Map<DayKey, Set<string>>();
  const subjectsOn = (date: DayKey) => {
    let set = daySubjects.get(date);
    if (!set) daySubjects.set(date, (set = new Set()));
    return set;
  };
  for (const f of input.fixed) subjectsOn(f.date).add(f.subjectId);
  const allowSubject = (date: DayKey, subjectId: string) => {
    const set = subjectsOn(date);
    return set.has(subjectId) || set.size < subjectCap(date);
  };

  const place = (slot: Slot, draft: Omit<WindowItemDraft, "date" | "durationMinutes">) => {
    subjectsOn(slot.date).add(draft.subjectId);
    items.push({ date: slot.date, durationMinutes: slot.minutes, ...draft });
  };

  // ── Revision pool ────────────────────────────────────────
  let poolOrder = 0;
  const firstDate = input.slots[0]?.date ?? "";
  const pool: PoolEntry[] = input.revisionDue.map((r) => ({
    dueOn: firstDate, order: poolOrder++, topicId: r.topicId, subjectId: r.subjectId, note: r.reason,
  }));
  const revisedOn = new Set<string>();

  /**
   * A topic's spaced passes join the pool once its lessons and practice are all
   * placed or already done, still dated from its last lesson. Passes that fell
   * before the window are left to the learning engine's revision queue.
   */
  const queueRevisions = (queue: Queue) => {
    const lastLesson = queue.lastLessonDate;
    if (queue.revisionsQueued || queue.lessonsLeft > 0 || lastLesson === null) return;
    if (queue.units.includes("PRACTICE")) return;
    queue.revisionsQueued = true;
    const t = queue.candidate.topic;
    for (const offset of REVISION_OFFSETS) {
      const dueOn = addDays(lastLesson, offset);
      if (dueOn < input.windowStart) continue;
      pool.push({
        dueOn, order: poolOrder++, topicId: t.id, subjectId: t.subjectId,
        note: `Revision pass — ${t.title} (+${offset}d)`,
      });
    }
  };

  // ── Queues ───────────────────────────────────────────────
  const queues = new Map<string, Queue>();
  const behindBy = new Map<string, number>();
  let rank = 0;
  const addQueue = (candidate: TopicCandidate, exam: boolean) => {
    const id = candidate.topic.id;
    if (queues.has(id)) return;
    const mastery = input.state.get(id)?.mastery ?? 0;
    // Exam practice is meant to repeat across re-plans; term work picks up
    // where the student left off.
    const done = exam ? undefined : input.completedUnits.get(id);
    const fullLessons = exam || input.pretestPassed.has(id)
      ? 0
      : Math.max(1, Math.ceil(candidate.topic.estimatedMinutes / SESSION_MINUTES));
    const lessons = Math.max(0, fullLessons - (done?.lessons ?? 0));
    const practice = exam ? 1 : Math.max(0, practicesNeeded(mastery) - (done?.practices ?? 0));
    const units: Unit[] = [
      ...Array<Unit>(lessons).fill("LESSON"),
      ...Array<Unit>(practice).fill("PRACTICE"),
    ];
    const queue: Queue = {
      candidate, exam, rank: rank++, units, lessonsLeft: lessons,
      lastLessonDate: done?.lastLessonDate ?? null,
      placedOn: null,
      started: (done?.lessons ?? 0) + (done?.practices ?? 0) > 0,
      revisionsQueued: false,
    };
    queues.set(id, queue);
    queueRevisions(queue);
  };
  for (const selection of input.selections) {
    behindBy.set(selection.subjectId, selection.behindBy);
    for (const candidate of selection.candidates) addQueue(candidate, false);
  }
  for (const candidate of input.examCandidates) addQueue(candidate, true);

  const fullMinutes = days.reduce(
    (n, [, daySlots]) => n + daySlots.filter((s) => !s.short).reduce((m, s) => m + s.minutes, 0),
    0,
  );
  let gapMinutesLeft = Math.floor(fullMinutes * GAP_FILL_SHARE);

  const prereqsReady = (queue: Queue, date: DayKey): boolean => {
    for (const edge of incomingEdges(input.graph, queue.candidate.topic.id)) {
      if (edge.kind !== "PREREQUISITE") continue;
      const planned = queues.get(edge.from);
      if (planned) {
        if (planned.exam) {
          if (planned.placedOn === null || planned.placedOn >= date) return false;
          continue;
        }
        if (planned.lessonsLeft > 0) return false;
        if (planned.lastLessonDate !== null && planned.lastLessonDate >= date) return false;
        continue;
      }
      const mastery = input.state.get(edge.from)?.mastery ?? 0;
      if (mastery < GATE * edge.strength && !input.pretestPassed.has(edge.from)) return false;
    }
    return true;
  };

  const eligible = (queue: Queue, date: DayKey, slot: Slot): boolean => {
    const unit = queue.units[0];
    if (!unit) return false;
    if (!allowSubject(date, queue.candidate.topic.subjectId)) return false;
    if (queue.candidate.reason === "GAP_FILL" && gapMinutesLeft < slot.minutes) return false;
    if (!queue.started && !prereqsReady(queue, date)) return false;
    if (unit === "PRACTICE" && queue.lastLessonDate !== null && queue.lastLessonDate >= date) {
      return false;
    }
    return true;
  };

  const weekUses = new Map<string, number>(); // `${monday}:${subjectId}`
  const usesOf = (date: DayKey, subjectId: string) => weekUses.get(`${mondayOf(date)}:${subjectId}`) ?? 0;

  // Computed from the post-fixed-items `days`, so a catch-up slot a fixed
  // session has consumed no longer holds carry-over hostage all week.
  const catchUpWeeks = new Set<DayKey>();
  for (const [date, daySlots] of days) {
    if (daySlots.some((s) => s.catchUp)) catchUpWeeks.add(mondayOf(date));
  }
  /** Weeks whose catch-up slot has already been processed (whatever it did). */
  const catchUpHandled = new Set<DayKey>();
  /** Missed work waits for the week's catch-up slot while one is still coming this week. */
  const catchUpAhead = (slot: Slot) =>
    !slot.catchUp &&
    catchUpWeeks.has(mondayOf(slot.date)) &&
    !catchUpHandled.has(mondayOf(slot.date));

  const pickTopic = (slot: Slot, exam: boolean, only?: TopicCandidate["reason"]): Queue | null => {
    const options = [...queues.values()].filter(
      (q) =>
        q.exam === exam &&
        (only
          ? q.candidate.reason === only
          : q.candidate.reason !== "CARRY_OVER" || !catchUpAhead(slot)) &&
        eligible(q, slot.date, slot),
    );
    options.sort((a, b) => {
      const sa = a.candidate.topic.subjectId;
      const sb = b.candidate.topic.subjectId;
      return (
        Number(a.candidate.reason === "PREVIEW") - Number(b.candidate.reason === "PREVIEW") ||
        usesOf(slot.date, sa) - usesOf(slot.date, sb) ||
        (behindBy.get(sb) ?? 0) - (behindBy.get(sa) ?? 0) ||
        sa.localeCompare(sb) ||
        Number(b.started) - Number(a.started) ||
        a.rank - b.rank
      );
    });
    return options[0] ?? null;
  };

  const takeRevision = (date: DayKey): PoolEntry | null => {
    const options = pool
      .filter((p) => p.dueOn <= date && !revisedOn.has(`${date}:${p.topicId}`) && allowSubject(date, p.subjectId))
      .sort((a, b) => a.dueOn.localeCompare(b.dueOn) || a.order - b.order);
    const entry = options[0];
    if (!entry) return null;
    pool.splice(pool.indexOf(entry), 1);
    revisedOn.add(`${date}:${entry.topicId}`);
    return entry;
  };

  const weekRevisions = new Map<DayKey, number>();
  /** Full (non-short) slots per week, from `days` — fixed, not a running count. */
  const weekFullSlots = new Map<DayKey, number>();
  for (const [date, daySlots] of days) {
    const week = mondayOf(date);
    const full = daySlots.filter((s) => !s.short).length;
    weekFullSlots.set(week, (weekFullSlots.get(week) ?? 0) + full);
  }

  const placeRevision = (slot: Slot, entry: PoolEntry) => {
    const week = mondayOf(slot.date);
    weekRevisions.set(week, (weekRevisions.get(week) ?? 0) + 1);
    place(slot, {
      subjectId: entry.subjectId, topicId: entry.topicId, activityType: "REVISION", notes: entry.note, carriedFrom: null,
    });
  };

  const placeUnit = (slot: Slot, queue: Queue) => {
    const unit = queue.units.shift() as Unit;
    const t = queue.candidate.topic;
    queue.started = true;
    queue.placedOn = slot.date;
    if (queue.candidate.reason === "GAP_FILL") gapMinutesLeft -= slot.minutes;
    const key = `${mondayOf(slot.date)}:${t.subjectId}`;
    weekUses.set(key, (weekUses.get(key) ?? 0) + 1);
    if (unit === "LESSON") {
      queue.lessonsLeft -= 1;
      queue.lastLessonDate = slot.date;
    }
    queueRevisions(queue);
    place(slot, {
      subjectId: t.subjectId, topicId: t.id, activityType: unit,
      notes: noteFor(queue.candidate, unit), carriedFrom: queue.candidate.carriedFrom,
    });
  };

  let subjectTurn = 0;
  const placePastQuestions = (slot: Slot): boolean => {
    for (let i = 0; i < input.subjectIds.length; i++) {
      const subjectId = input.subjectIds[(subjectTurn + i) % input.subjectIds.length];
      if (!allowSubject(slot.date, subjectId)) continue;
      subjectTurn = (subjectTurn + i + 1) % input.subjectIds.length;
      const name = input.subjectNames[subjectId];
      place(slot, {
        subjectId, topicId: null, activityType: "PAST_QUESTIONS",
        notes: name ? `Past questions — ${name}` : "Past questions practice", carriedFrom: null,
      });
      return true;
    }
    return false;
  };

  // ── Runway mocks ─────────────────────────────────────────
  const pendingMocks: DayKey[] = [];
  if (input.mode !== "TERM" && input.runwayStart && input.targetDate) {
    const runwayLength = daysBetween(input.runwayStart, input.targetDate) + 1;
    for (let i = input.mocksTaken; i < MOCK_COUNT; i++) {
      pendingMocks.push(addDays(input.runwayStart, Math.floor((runwayLength * i) / MOCK_COUNT)));
    }
  }
  const inRunway = (date: DayKey) =>
    input.mode !== "TERM" && input.runwayStart !== null && date >= input.runwayStart;

  const shareFor = (date: DayKey): number => {
    if (input.mode === "TERM") return 0;
    if (input.mode === "EXAM" || !input.targetDate) return 1;
    return examShare(daysBetween(date, input.targetDate));
  };

  // ── Main loop ────────────────────────────────────────────
  let examCredit = 0;
  let examSlots = 0;

  const placeWork = (slot: Slot, exam: boolean): boolean => {
    if (exam) {
      if (input.mode === "TERM") return false;
      examSlots += 1;
      if (examSlots % PAST_QUESTIONS_EVERY === 0 && placePastQuestions(slot)) return true;
      const queue = pickTopic(slot, true);
      if (queue) {
        placeUnit(slot, queue);
        return true;
      }
      return placePastQuestions(slot);
    }
    const week = mondayOf(slot.date);
    const revisionsSoFar = weekRevisions.get(week) ?? 0;
    if (revisionsSoFar + 1 <= (weekFullSlots.get(week) ?? 0) * REVISION_SHARE) {
      const entry = takeRevision(slot.date);
      if (entry) {
        placeRevision(slot, entry);
        return true;
      }
    }
    const queue = pickTopic(slot, false);
    if (!queue) return false;
    placeUnit(slot, queue);
    return true;
  };

  for (const [date, daySlots] of days) {
    if (daySlots.length === 0) continue;

    if (inRunway(date)) {
      const hasFullSlot = daySlots.some((s) => !s.short);
      if (pendingMocks.length > 0 && pendingMocks[0] <= date && hasFullSlot) {
        pendingMocks.shift();
        const minutes = Math.min(MOCK_MINUTES_CAP, daySlots.reduce((n, s) => n + s.minutes, 0));
        const subjectId = input.subjectIds[0];
        if (subjectId) {
          subjectsOn(date).add(subjectId);
          items.push({
            date, subjectId, topicId: null, activityType: "MOCK_EXAM", durationMinutes: minutes,
            notes: "Full mock exam — timed conditions", carriedFrom: null,
          });
        }
        continue;
      }
      for (const slot of daySlots) {
        const entry = takeRevision(date);
        if (entry) placeRevision(slot, entry);
        else if (!slot.short) placePastQuestions(slot);
      }
      continue;
    }

    for (const slot of daySlots) {
      if (slot.short) {
        const entry = takeRevision(date);
        if (entry) placeRevision(slot, entry);
        continue;
      }
      const week = mondayOf(date);

      if (slot.catchUp) {
        // The week's catch-up slot is "handled" the moment it's reached,
        // whatever it does with it — carry-over stops being held after this.
        catchUpHandled.add(week);
        const carried = pickTopic(slot, false, "CARRY_OVER");
        if (carried) {
          placeUnit(slot, carried);
          continue;
        }
        const entry = takeRevision(date);
        if (entry) {
          placeRevision(slot, entry);
          continue;
        }
      }

      examCredit += shareFor(date);
      const wantExam = examCredit >= 1;
      if (wantExam) examCredit -= 1;
      if (placeWork(slot, wantExam) || placeWork(slot, !wantExam)) continue;
      const entry = takeRevision(date);
      if (entry) placeRevision(slot, entry);
    }
  }

  // ── Overload ─────────────────────────────────────────────
  const unfinished = [...queues.values()].filter(
    (q) => !q.exam && q.candidate.reason !== "PREVIEW" && q.units.length > 0,
  );
  let overload: Overload | null = null;
  if (unfinished.length > 0 && input.slots.length > 0) {
    const unplacedMinutes = unfinished.reduce((n, q) => n + q.units.length * SESSION_MINUTES, 0);
    const windowDays = daysBetween(input.slots[0].date, input.slots[input.slots.length - 1].date) + 1;
    const weeks = Math.max(1, Math.ceil(windowDays / 7));
    overload = {
      topicsBehind: unfinished.length,
      suggestedExtraMinutesPerWeek: Math.ceil(unplacedMinutes / weeks / SESSION_MINUTES) * SESSION_MINUTES,
    };
  }

  return { items, overload };
}
