import { incomingEdges, type GraphNode, type KnowledgeGraph } from "../learning/graph";
import type { TopicStateMap } from "../learning/mastery";
import { GATE, TARGET } from "../learning/availability";
import { CLASS_LEVELS, type ClassLevel, type Term } from "../../lib/curriculum-scope";
import type { DayKey } from "./days";
import type { TermContext } from "./term-context";

// Which topics a subject's plan should work on, and why. Term mode follows the
// class through the scheme of work; exam mode ranks weak topics by marks.

export type PlanTopic = GraphNode & { classLevel: ClassLevel; term: Term };

export type CandidateReason =
  | "CARRY_OVER"
  | "GAP_FILL"
  | "CURRENT"
  | "CATCH_UP"
  | "PREVIEW"
  | "EXAM";

export type TopicCandidate = {
  topic: PlanTopic;
  reason: CandidateReason;
  /** The missed session this topic came from, for "moved from …". */
  carriedFrom: DayKey | null;
  /** For gap-fill: the title of the topic this foundation unlocks. */
  unlocks: string | null;
};

export type CarryOver = { topicId: string; subjectId: string; missedOn: DayKey };

export type SubjectSelection = {
  subjectId: string;
  /** The class's current term topics in teaching order; the outline paces through these. */
  termTopics: PlanTopic[];
  /** Index into termTopics where the class is; -1 when there is none. */
  classIndex: number;
  /** How many topics the student trails the class by. */
  behindBy: number;
  /** In priority order: carry-over, gap-fill, current, catch-up, preview. */
  candidates: TopicCandidate[];
};

export type SelectTermTopicsInput = {
  subjectId: string;
  classLevel: ClassLevel;
  termContext: TermContext;
  /** Every topic in the subject, any class. */
  topics: readonly PlanTopic[];
  graph: KnowledgeGraph;
  state: TopicStateMap;
  pretestPassed: ReadonlySet<string>;
  positionTopicId: string | null;
  carryOver: readonly CarryOver[];
  /** EXAM mode pauses new term learning; only missed work carries on. */
  carryOverOnly?: boolean;
};

function mastery(state: TopicStateMap, topicId: string): number {
  return state.get(topicId)?.mastery ?? 0;
}

function byOrder(a: PlanTopic, b: PlanTopic): number {
  return a.orderIndex - b.orderIndex || a.id.localeCompare(b.id);
}

export function atOrBelowClass(topic: { classLevel: ClassLevel }, classLevel: ClassLevel): boolean {
  return CLASS_LEVELS.indexOf(topic.classLevel) <= CLASS_LEVELS.indexOf(classLevel);
}

function scopeTopics(topics: readonly PlanTopic[], classLevel: ClassLevel, term: Term): PlanTopic[] {
  return topics.filter((t) => t.classLevel === classLevel && t.term === term).sort(byOrder);
}

type ClassLocation = { termTopics: PlanTopic[]; classIndex: number; preview: PlanTopic[] };

function locateByCalendar(
  allowed: readonly PlanTopic[],
  classLevel: ClassLevel,
  ctx: TermContext,
): ClassLocation {
  if (ctx.kind === "in_term") {
    const termTopics = scopeTopics(allowed, classLevel, ctx.current.term);
    if (termTopics.length === 0) return { termTopics, classIndex: -1, preview: [] };
    const classIndex = Math.min(
      termTopics.length - 1,
      Math.floor(((ctx.weekOfTerm - 1) / ctx.totalWeeks) * termTopics.length),
    );
    return { termTopics, classIndex, preview: termTopics.slice(classIndex + 1, classIndex + 2) };
  }
  // Holiday: the class has finished the previous term. A FIRST term next means
  // a new class year, whose topics are above the student's class — no preview.
  const termTopics = ctx.previous ? scopeTopics(allowed, classLevel, ctx.previous.term) : [];
  const preview =
    ctx.next && ctx.next.term !== "FIRST"
      ? scopeTopics(allowed, classLevel, ctx.next.term).slice(0, 2)
      : [];
  return { termTopics, classIndex: termTopics.length - 1, preview };
}

function locateClass(input: SelectTermTopicsInput, allowed: readonly PlanTopic[]): ClassLocation {
  const position = input.positionTopicId
    ? allowed.find((t) => t.id === input.positionTopicId)
    : undefined;
  if (position) {
    const termTopics = scopeTopics(allowed, position.classLevel, position.term);
    const classIndex = termTopics.findIndex((t) => t.id === position.id);
    return { termTopics, classIndex, preview: termTopics.slice(classIndex + 1, classIndex + 2) };
  }
  return locateByCalendar(allowed, input.classLevel, input.termContext);
}

/** Weak prerequisites from earlier terms or classes, deepest foundations first. */
function gapsFor(
  target: PlanTopic,
  input: SelectTermTopicsInput,
  byId: ReadonlyMap<string, PlanTopic>,
  termIds: ReadonlySet<string>,
): PlanTopic[] {
  const out: PlanTopic[] = [];
  const visited = new Set<string>();
  const visit = (topicId: string) => {
    for (const edge of incomingEdges(input.graph, topicId)) {
      if (edge.kind !== "PREREQUISITE" || visited.has(edge.from)) continue;
      visited.add(edge.from);
      const prereq = byId.get(edge.from);
      if (!prereq || termIds.has(prereq.id)) continue;
      if (mastery(input.state, prereq.id) >= GATE || input.pretestPassed.has(prereq.id)) continue;
      visit(prereq.id);
      out.push(prereq);
    }
  };
  visit(target.id);
  return out;
}

export function selectTermTopics(input: SelectTermTopicsInput): SubjectSelection {
  const allowed = input.topics.filter((t) => atOrBelowClass(t, input.classLevel));
  const byId = new Map(allowed.map((t) => [t.id, t]));
  const unmastered = (t: PlanTopic) => mastery(input.state, t.id) < TARGET;
  const { termTopics, classIndex, preview } = locateClass(input, allowed);

  const candidates: TopicCandidate[] = [];
  const seen = new Set<string>();
  const add = (topic: PlanTopic, reason: CandidateReason, extra: Partial<TopicCandidate> = {}) => {
    if (seen.has(topic.id)) return;
    seen.add(topic.id);
    candidates.push({ topic, reason, carriedFrom: null, unlocks: null, ...extra });
  };

  for (const item of input.carryOver) {
    const t = byId.get(item.topicId);
    if (t && item.subjectId === input.subjectId && unmastered(t)) {
      add(t, "CARRY_OVER", { carriedFrom: item.missedOn });
    }
  }

  if (!input.carryOverOnly) {
    const current = classIndex >= 0 ? termTopics[classIndex] : null;
    const currentNeeded = current && unmastered(current) ? current : null;
    const catchUp = termTopics.slice(0, Math.max(0, classIndex)).filter(unmastered);
    const termIds = new Set(termTopics.map((t) => t.id));

    for (const t of [...(currentNeeded ? [currentNeeded] : []), ...catchUp]) {
      for (const gap of gapsFor(t, input, byId, termIds)) {
        add(gap, "GAP_FILL", { unlocks: t.title });
      }
    }
    if (currentNeeded) add(currentNeeded, "CURRENT");
    for (const t of catchUp) add(t, "CATCH_UP");
    for (const t of preview.filter(unmastered)) add(t, "PREVIEW");
  }

  const firstUnmastered = termTopics.findIndex(unmastered);
  const behindBy =
    classIndex < 0 || firstUnmastered < 0 ? 0 : Math.max(0, classIndex - firstUnmastered);

  return { subjectId: input.subjectId, termTopics, classIndex, behindBy, candidates };
}

export function selectExamTopics(input: {
  topics: readonly PlanTopic[];
  classLevel: ClassLevel;
  state: TopicStateMap;
}): TopicCandidate[] {
  const weight = (t: PlanTopic) => t.waecWeight + t.jambWeight;
  return input.topics
    .filter((t) => atOrBelowClass(t, input.classLevel) && mastery(input.state, t.id) < TARGET)
    .sort(
      (a, b) =>
        weight(b) - weight(a) ||
        mastery(input.state, a.id) - mastery(input.state, b.id) ||
        byOrder(a, b),
    )
    .map((topic) => ({ topic, reason: "EXAM" as const, carriedFrom: null, unlocks: null }));
}

/** Where the calendar says the class is in one subject, ignoring any override. */
export function calendarTopicId(
  topics: readonly PlanTopic[],
  classLevel: ClassLevel,
  ctx: TermContext,
): string | null {
  const allowed = topics.filter((t) => atOrBelowClass(t, classLevel));
  const { termTopics, classIndex } = locateByCalendar(allowed, classLevel, ctx);
  return classIndex >= 0 ? termTopics[classIndex].id : null;
}
