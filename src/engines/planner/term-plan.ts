import type { KnowledgeGraph } from "../learning/graph";
import type { TopicStateMap } from "../learning/mastery";
import type { ClassLevel } from "../../lib/curriculum-scope";
import { addDays, daysBetween, type DayKey } from "./days";
import { layoutWindow, type FixedItem, type Overload, type RevisionDue, type WindowItemDraft } from "./layout";
import { computeRunwayStart, type PlanMode } from "./mode";
import { projectOutline, type OutlineWeek } from "./outline";
import { buildSlots, type Availability } from "./slots";
import type { TermContext } from "./term-context";
import {
  selectExamTopics,
  selectTermTopics,
  type CarryOver,
  type PlanTopic,
} from "./topics";

// The planner's single entry point. See
// docs/superpowers/specs/2026-09-14-study-plan-term-mode-design.md §5.

export const WINDOW_DAYS = 14;

export type PlannerSubject = { id: string; name: string; topics: readonly PlanTopic[] };

export type PlannerInput = {
  today: DayKey;
  /** The day the plan was created: anchors the exam runway. */
  planStart: DayKey;
  mode: PlanMode;
  classLevel: ClassLevel;
  targetDate: DayKey | null;
  termContext: TermContext;
  availability: Availability;
  subjects: readonly PlannerSubject[];
  graph: KnowledgeGraph;
  state: TopicStateMap;
  pretestPassed: ReadonlySet<string>;
  /** subjectId → topicId: "my class is on topic X". */
  positions: ReadonlyMap<string, string>;
  revisionDue: readonly RevisionDue[];
  carryOver: readonly CarryOver[];
  fixed: readonly FixedItem[];
  /** Mock exams on/after the runway start already completed or skipped. */
  mocksTaken: number;
};

export type PlannerOutput = {
  items: WindowItemDraft[];
  outline: OutlineWeek[];
  overload: Overload | null;
  plannedThrough: DayKey;
  runwayStart: DayKey | null;
};

export function planWindow(input: PlannerInput): PlannerOutput {
  const examBound = input.mode !== "TERM" && input.targetDate !== null;
  const days = examBound
    ? Math.max(0, Math.min(WINDOW_DAYS, daysBetween(input.today, input.targetDate as DayKey) + 1))
    : WINDOW_DAYS;
  const plannedThrough = addDays(input.today, Math.max(1, days) - 1);

  const selections = input.subjects.map((subject) =>
    selectTermTopics({
      subjectId: subject.id,
      classLevel: input.classLevel,
      termContext: input.termContext,
      topics: subject.topics,
      graph: input.graph,
      state: input.state,
      pretestPassed: input.pretestPassed,
      positionTopicId: input.positions.get(subject.id) ?? null,
      carryOver: input.carryOver,
      carryOverOnly: input.mode === "EXAM",
    }),
  );

  const examCandidates =
    input.mode === "TERM"
      ? []
      : selectExamTopics({
          topics: input.subjects.flatMap((s) => s.topics),
          classLevel: input.classLevel,
          state: input.state,
        });

  const runwayStart = examBound
    ? computeRunwayStart(input.planStart, input.targetDate as DayKey)
    : null;

  const { items, overload } = layoutWindow({
    mode: input.mode,
    slots: buildSlots(input.today, days, input.availability),
    targetDate: input.targetDate,
    runwayStart,
    selections,
    examCandidates,
    subjectIds: input.subjects.map((s) => s.id),
    subjectNames: Object.fromEntries(input.subjects.map((s) => [s.id, s.name])),
    graph: input.graph,
    state: input.state,
    pretestPassed: input.pretestPassed,
    revisionDue: input.revisionDue,
    fixed: input.fixed,
    mocksTaken: input.mocksTaken,
  });

  const until = examBound
    ? input.targetDate
    : input.termContext.kind === "in_term"
      ? input.termContext.current.endsOn
      : null;

  const outline = projectOutline({
    today: input.today,
    from: addDays(plannedThrough, 1),
    until,
    mode: input.mode,
    runwayStart,
    termContext: input.termContext,
    selections,
  });

  return { items, outline, overload, plannedThrough, runwayStart };
}
