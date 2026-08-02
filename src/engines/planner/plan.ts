import type { KnowledgeGraph } from "../learning/graph";
import { incomingEdges, outgoingEdges } from "../learning/graph";
import { GATE, TARGET } from "../learning/availability";
import { examWeight, unmasteredDependents } from "../learning/recommend";
import {
  revisionQueue,
  type RevisionExtrasMap,
} from "../learning/revision";
import type { TopicStateMap } from "../learning/mastery";

// Study planner — graph-aware topological scheduler (algorithm F).
// See docs/superpowers/specs/2026-08-02-learning-path-engine-design.md
//
// Deterministic: the same (graph, state, window) always yields the same plan.
// Pure: it never reads the DB — the route supplies the derived state and any
// revision extras, and the caller persists the returned drafts.

export type PlanActivityType =
  | "LESSON"
  | "PRACTICE"
  | "REVISION"
  | "PAST_QUESTIONS"
  | "MOCK_EXAM";

export interface PlanItemDraft {
  date: Date;
  subjectId: string;
  topicId: string | null;
  activityType: PlanActivityType;
  durationMinutes: number;
  notes: string | null;
}

export interface PlanInput {
  graph: KnowledgeGraph;
  state: TopicStateMap;
  subjectIds: readonly string[];
  /** Start-of-day anchor; the first day of the plan. */
  start: Date;
  /** End of the plan (the exam date). */
  targetDate: Date;
  /** Daily study budget in minutes. */
  dailyMinutes: number;
  /** Optional DB-backed revision evidence (SRS + cadence); falls back to pure decay. */
  revisionExtras?: RevisionExtrasMap;
  /** Topic ids self-certified by a readiness pretest — count as satisfied prereqs. */
  pretestPassed?: ReadonlySet<string>;
  /** Optional display names for subjects, used in notes. */
  subjectNames?: Record<string, string>;
  /** Length of one session slot in minutes. */
  sessionMinutes?: number;
  /** Clock used for SRS-due checks; defaults to `start`. */
  now?: Date;
}

export interface PlanWindow {
  totalDays: number;
  /** Days before the revision runway that hold new learning. */
  learnDays: number;
  /** Final days reserved for revision-only work + mock exams. */
  runwayDays: number;
  /** Date of the first runway day. */
  runwayStart: Date;
}

const DAY_MS = 86_400_000;

export const REVISION_OFFSETS = [1, 3, 7, 14] as const;
export const WEAK_MASTERY = 50;
export const WEAK_BONUS = 0.5;
export const RUNWAY_FRACTION = 0.2;
export const RUNWAY_MIN_DAYS = 14;
export const RUNWAY_MAX_DAYS = 21;
export const MOCK_COUNT = 2;
const MOCK_DURATION_CAP = 180;

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

/** Plan window math: the last RUNWAY_FRACTION (clamped 14..21) days are the runway. */
export function computePlanWindow(
  start: Date,
  targetDate: Date,
): PlanWindow {
  const s = startOfDay(start);
  const t = startOfDay(targetDate);
  const totalDays = Math.max(
    1,
    Math.round((t.getTime() - s.getTime()) / DAY_MS) + 1,
  );
  const rawRunway = Math.round(totalDays * RUNWAY_FRACTION);
  const runwayDays = Math.max(
    0,
    Math.min(RUNWAY_MAX_DAYS, Math.max(RUNWAY_MIN_DAYS, rawRunway), totalDays),
  );
  const learnDays = Math.max(0, totalDays - runwayDays);
  return {
    totalDays,
    learnDays,
    runwayDays,
    runwayStart: addDays(s, learnDays),
  };
}

function urgency(state: TopicStateMap, topicId: string): number {
  const mastery = state.get(topicId)?.mastery ?? 0;
  return Math.min(1, Math.max(0, (TARGET - mastery) / TARGET));
}

/** Fraction of dependent-topic exam weight still below TARGET (0 if none). */
function leverage(
  state: TopicStateMap,
  graph: KnowledgeGraph,
  topicId: string,
): number {
  const dependents = outgoingEdges(graph, topicId)
    .map((edge) => graph.nodes.get(edge.to))
    .filter((node): node is NonNullable<typeof node> => node !== undefined);
  const unmastered = dependents.filter(
    (node) => (state.get(node.id)?.mastery ?? 0) < TARGET,
  );
  const total = dependents.reduce((sum, node) => sum + examWeight(node), 0);
  if (total <= 0) return 0;
  const unmasteredWeight = unmastered.reduce(
    (sum, node) => sum + examWeight(node),
    0,
  );
  return unmasteredWeight / total;
}

/** One-line reason for a topic's lesson block, shown on the plan rows. */
function topicNote(
  topicId: string,
  state: TopicStateMap,
  graph: KnowledgeGraph,
): string {
  const unmastered = unmasteredDependents(state, graph, topicId);
  if (unmastered.length > 0) {
    const names = unmastered.slice(0, 2).map((node) => node.title);
    const extra = unmastered.length > 2 ? ` +${unmastered.length - 2} more` : "";
    return `Unlocks ${names.join(" + ")}${extra}`;
  }
  const mastery = state.get(topicId)?.mastery ?? 0;
  return mastery < WEAK_MASTERY
    ? "Weak spot — build this foundation"
    : "Next in your learning path";
}

interface Unit {
  activityType: "LESSON" | "PRACTICE";
  notes: string;
}

interface TopicQueue {
  node: NonNullable<KnowledgeGraph["nodes"] extends Map<string, infer V> ? V : never>;
  lessons: number;
  scheduledLessons: number;
  lessonFinishDay: number | null;
  units: Unit[];
}

function makeZeroExtras(graph: KnowledgeGraph): RevisionExtrasMap {
  const map: RevisionExtrasMap = new Map();
  for (const id of graph.nodes.keys()) {
    map.set(id, { cadenceDueAt: null, dueSrsCards: 0 });
  }
  return map;
}

/**
 * A topic's units may be scheduled as soon as every incoming PREREQUISITE is
 * satisfied: the prerequisite is part of this plan and its units are already
 * fully scheduled, OR it is not in the plan but already meets its mastery gate
 * (or was self-certified by a readiness pretest).
 * Unlike the static `isAvailable` gate (which reads the live state map), this
 * respects topics that the plan itself unlocks.
 */
function planReady(
  graph: KnowledgeGraph,
  queues: Map<string, TopicQueue>,
  state: TopicStateMap,
  topicId: string,
  pretestPassed: ReadonlySet<string> = new Set(),
): boolean {
  for (const edge of incomingEdges(graph, topicId)) {
    if (edge.kind !== "PREREQUISITE") continue;
    const prereqQueue = queues.get(edge.from);
    if (prereqQueue) {
      if (prereqQueue.units.length > 0) return false;
      continue;
    }
    const need = GATE * edge.strength;
    if ((state.get(edge.from)?.mastery ?? 0) < need && !pretestPassed.has(edge.from)) {
      return false;
    }
  }
  return true;
}

/** The legacy behaviour: round-robin subjects × activity types. Used when the graph has no edges. */
function roundRobinPlan(
  input: PlanInput,
  win: PlanWindow,
  sessionMinutes: number,
): PlanItemDraft[] {
  const subjects = input.subjectIds;
  if (subjects.length === 0) return [];
  const activities: PlanActivityType[] = [
    "LESSON",
    "PRACTICE",
    "REVISION",
    "PAST_QUESTIONS",
  ];
  const sessionsPerDay = Math.max(1, Math.floor(input.dailyMinutes / sessionMinutes));
  const start = startOfDay(input.start);
  const items: PlanItemDraft[] = [];
  for (let day = 0; day < win.totalDays; day++) {
    const date = addDays(start, day);
    for (let slot = 0; slot < sessionsPerDay; slot++) {
      const index = day * sessionsPerDay + slot;
      items.push({
        date,
        subjectId: subjects[index % subjects.length],
        topicId: null,
        activityType: activities[index % activities.length],
        durationMinutes: sessionMinutes,
        notes: null,
      });
    }
  }
  return items;
}

/**
 * Algorithm F: allocates lesson/practice sessions in topological order
 * (dependent topics wait for their scheduled prereqs), schedules the
 * +1/+3/+7/+14 revision passes after each lesson block, and reserves the final
 * runway for mocks first, then revision in priority order.
 */
export function generatePlan(input: PlanInput): PlanItemDraft[] {
  const sessionMinutes = input.sessionMinutes ?? 30;
  const now = input.now ?? input.start;
  const win = computePlanWindow(input.start, input.targetDate);
  const start = startOfDay(input.start);
  const chosen = new Set(input.subjectIds);

  const topics = [...input.graph.nodes.values()].filter((node) =>
    chosen.has(node.subjectId),
  );
  if (input.graph.edges.length === 0 || topics.length === 0) {
    return roundRobinPlan(input, win, sessionMinutes);
  }

  const learnable = topics.filter(
    (node) => (input.state.get(node.id)?.mastery ?? 0) < TARGET,
  );

  // Per-topic session allocation (algorithm F step 3).
  const queues = new Map<string, TopicQueue>();
  for (const node of learnable) {
    const mastery = input.state.get(node.id)?.mastery ?? 0;
    const weakBonus = mastery < WEAK_MASTERY ? WEAK_BONUS : 0;
    const lessons = Math.max(
      1,
      Math.ceil((node.estimatedMinutes * (1 + weakBonus)) / sessionMinutes),
    );
    const practice = mastery < WEAK_MASTERY ? 2 : 1;
    const note = topicNote(node.id, input.state, input.graph);
    const units: Unit[] = [];
    for (let i = 0; i < lessons; i++) {
      units.push({ activityType: "LESSON", notes: note });
    }
    for (let i = 0; i < practice; i++) {
      units.push({
        activityType: "PRACTICE",
        notes: `Drill ${node.title} questions`,
      });
    }
    queues.set(node.id, {
      node,
      lessons,
      scheduledLessons: 0,
      lessonFinishDay: null,
      units,
    });
  }

  // Forwards greedy schedule over the learnable days (algorithm F step 4).
  const learning: PlanItemDraft[] = [];
  const sessionsPerDay = Math.max(1, Math.floor(input.dailyMinutes / sessionMinutes));
  const subjectPicks = new Map<string, number>();
  let exhausted = false;
  for (let day = 0; day < win.learnDays && !exhausted; day++) {
    const date = addDays(start, day);
    for (let slot = 0; slot < sessionsPerDay; slot++) {
      const candidates = [...queues.values()].filter(
        (queue) =>
          queue.units.length > 0 &&
          planReady(
            input.graph,
            queues,
            input.state,
            queue.node.id,
            input.pretestPassed,
          ),
      );
      if (candidates.length === 0) {
        exhausted = true;
        break;
      }
  const scored = candidates.map((queue) => ({
    queue,
    score:
      urgency(input.state, queue.node.id) +
      leverage(input.state, input.graph, queue.node.id),
  }));
  const maxScore = Math.max(...scored.map((entry) => entry.score));
  const pick = scored
    .filter((entry) => Math.abs(entry.score - maxScore) < 1e-9)
    .sort(
      (a, b) =>
        (subjectPicks.get(a.queue.node.subjectId) ?? 0) -
          (subjectPicks.get(b.queue.node.subjectId) ?? 0) ||
        a.queue.node.orderIndex - b.queue.node.orderIndex,
    )[0].queue;
      const unit = pick.units.shift() as Unit;
      subjectPicks.set(
        pick.node.subjectId,
        (subjectPicks.get(pick.node.subjectId) ?? 0) + 1,
      );
      if (unit.activityType === "LESSON") {
        pick.scheduledLessons += 1;
        if (pick.scheduledLessons === pick.lessons) pick.lessonFinishDay = day;
      }
      learning.push({
        date,
        subjectId: pick.node.subjectId,
        topicId: pick.node.id,
        activityType: unit.activityType,
        durationMinutes: sessionMinutes,
        notes: unit.notes,
      });
    }
  }

  // Revision passes at +1/+3/+7/+14 after each lesson block (algorithm F step 3).
  const revisionPasses: PlanItemDraft[] = [];
  const endMs = startOfDay(input.targetDate).getTime() + DAY_MS - 1;
  for (const queue of queues.values()) {
    if (queue.lessonFinishDay == null) continue;
    const base = addDays(start, queue.lessonFinishDay);
    for (const offset of REVISION_OFFSETS) {
      const date = addDays(base, offset);
      if (date.getTime() > endMs) continue;
      revisionPasses.push({
        date,
        subjectId: queue.node.subjectId,
        topicId: queue.node.id,
        activityType: "REVISION",
        durationMinutes: sessionMinutes,
        notes: `Revision pass — ${queue.node.title} (+${offset}d)`,
      });
    }
  }

  // The runway: mocks first, then consolidation revision in priority order,
  // then past-questions fill (algorithm F steps 1 + 5).
  const runway: PlanItemDraft[] = [];
  const mockMinutes = Math.min(input.dailyMinutes, MOCK_DURATION_CAP);
  const mockDays = new Set<number>();
  for (let i = 0; i < MOCK_COUNT; i++) {
    const day = Math.floor((win.runwayDays * i) / MOCK_COUNT);
    mockDays.add(day);
    runway.push({
      date: addDays(win.runwayStart, day),
      subjectId: input.subjectIds[0],
      topicId: null,
      activityType: "MOCK_EXAM",
      durationMinutes: mockMinutes,
      notes: "Full mock exam — timed conditions",
    });
  }

  const slots: Date[] = [];
  for (let day = 0; day < win.runwayDays; day++) {
    if (mockDays.has(day)) continue;
    for (let slot = 0; slot < sessionsPerDay; slot++) {
      slots.push(addDays(win.runwayStart, day));
    }
  }

  const extras = input.revisionExtras ?? makeZeroExtras(input.graph);
  const consolidation = revisionQueue(input.state, input.graph, extras, {
    now,
  }).filter((item) => chosen.has(item.subjectId));

  let slotIdx = 0;
  for (const item of consolidation) {
    if (slotIdx >= slots.length) break;
    runway.push({
      date: slots[slotIdx++],
      subjectId: item.subjectId,
      topicId: item.topicId,
      activityType: "REVISION",
      durationMinutes: sessionMinutes,
      notes: item.reason,
    });
  }
  let subjectIdx = 0;
  while (slotIdx < slots.length) {
    const subjectId = input.subjectIds[subjectIdx % input.subjectIds.length];
    subjectIdx += 1;
    runway.push({
      date: slots[slotIdx++],
      subjectId,
      topicId: null,
      activityType: "PAST_QUESTIONS",
      durationMinutes: sessionMinutes,
      notes: input.subjectNames
        ? `Past questions — ${input.subjectNames[subjectId]}`
        : "Past questions practice",
    });
  }

  // Stable sort by date only: preserves the scheduler's emission order (which
  // is already a valid topological order), so a dependent topic never appears
  // before all of its scheduled prerequisites within the emitted plan.
  return [...learning, ...revisionPasses, ...runway].sort(
    (a, b) => a.date.getTime() - b.date.getTime(),
  );
}
