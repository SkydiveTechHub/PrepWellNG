import type { PrismaClient } from "@prisma/client";
import { incomingEdges, loadGraph, type KnowledgeGraph } from "./graph";
import {
  computeTopicState,
  type TopicStateMap,
} from "./mastery";

// Learning Path Engine — the progressive unlock gate (algorithm B).
// See docs/superpowers/specs/2026-08-02-learning-path-engine-design.md

/** A topic is "done" at mastery ≥ 70. */
export const TARGET = 70;
/** Default mastery a strength-1.0 prerequisite requires to unlock a dependent. */
export const GATE = 60;
/** Readiness pretest pass mark (%). */
export const PRETEST_PASS = 80;

export type TopicReadyCheck = {
  prisma: Pick<
    PrismaClient,
    | "topic"
    | "topicEdge"
    | "topicMastery"
    | "learningEvent"
    | "performanceMetric"
  >;
  studentId: string;
  subjectId: string;
  topicId: string;
  now?: Date;
  pretestPassed?: ReadonlySet<string>;
};

/**
 * Topic ids the student self-certified with a readiness pretest (≥80% on 5
 * questions) within a subject. Earned once — `PerformanceMetric.pretestPassedAt`
 * is written on the pass and never cleared, so the dependent gate stays open.
 */
export async function loadPretestPassed(
  prisma: Pick<PrismaClient, "performanceMetric">,
  studentId: string,
  subjectId: string,
): Promise<ReadonlySet<string>> {
  const rows = await prisma.performanceMetric.findMany({
    where: {
      studentId,
      subjectId,
      topicId: { not: null },
      pretestPassedAt: { not: null },
    },
    select: { topicId: true },
  });
  return new Set(
    rows.map((row) => row.topicId).filter((id): id is string => id !== null),
  );
}

/**
 * True when every incoming PREREQUISITE edge's mastery gate is met (or the
 * prerequisite was self-certified by a readiness pretest). Pure — the caller
 * supplies the derived state map.
 */
export function isAvailable(
  topicId: string,
  state: TopicStateMap,
  graph: KnowledgeGraph,
  pretestPassed: ReadonlySet<string> = new Set(),
): boolean {
  for (const edge of incomingEdges(graph, topicId)) {
    if (edge.kind !== "PREREQUISITE") continue;
    const need = GATE * edge.strength;
    const mastery = state.get(edge.from)?.mastery ?? 0;
    if (mastery < need && !pretestPassed.has(edge.from)) return false;
  }
  return true;
}

export interface PrereqStatus {
  topicId: string;
  subjectId: string;
  title: string;
  slug: string;
  /** Mastery (0..100) the prerequisite must reach to unlock. */
  need: number;
  /** The student's current composite mastery of the prerequisite. */
  mastery: number;
  met: boolean;
  rationale: string | null;
}

/** One status chip per incoming PREREQUISITE edge. */
export function prereqStatuses(
  topicId: string,
  graph: KnowledgeGraph,
  state: TopicStateMap,
  pretestPassed: ReadonlySet<string> = new Set(),
): PrereqStatus[] {
  return incomingEdges(graph, topicId)
    .filter((edge) => edge.kind === "PREREQUISITE")
    .map((edge) => {
      const node = graph.nodes.get(edge.from);
      const mastery = state.get(edge.from)?.mastery ?? 0;
      const need = Math.round(GATE * edge.strength);
      return {
        topicId: edge.from,
        subjectId: node?.subjectId ?? "",
        title: node?.title ?? "Unknown topic",
        slug: node?.slug ?? "",
        need,
        mastery,
        met: mastery >= need || pretestPassed.has(edge.from),
        rationale: edge.rationale,
      };
    });
}

/** A Lesson.prerequisites entry, resolved to concrete ids by the caller. */
export type ResolvedPrerequisite =
  | { kind: "lesson"; lessonId: string }
  | { kind: "topic"; topicId: string };

/**
 * Resolves the authoring `prerequisites` JSON into concrete references.
 * Entries that reference an unknown title are dropped — lesson-level
 * prerequisites are a progressive enhancement and never hard-block on
 * stale metadata.
 */
export function resolvePrerequisiteEntries(
  raw: unknown,
  lessonIdByTitle: ReadonlyMap<string, string>,
  topicIdByTitle: ReadonlyMap<string, string>,
): ResolvedPrerequisite[] {
  if (!Array.isArray(raw)) return [];
  const resolved: ResolvedPrerequisite[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const record = item as Record<string, unknown>;
    const lessonTitle = record.lessonTitle;
    if (typeof lessonTitle === "string") {
      const lessonId = lessonIdByTitle.get(lessonTitle);
      if (lessonId) resolved.push({ kind: "lesson", lessonId });
      continue;
    }
    const topicTitle = record.topicTitle;
    if (typeof topicTitle === "string") {
      const topicId = topicIdByTitle.get(topicTitle);
      if (topicId) resolved.push({ kind: "topic", topicId });
    }
  }
  return resolved;
}

export interface LessonUnlockInput {
  topicReady: boolean;
  prerequisites: readonly ResolvedPrerequisite[];
  completedLessonIds: ReadonlySet<string>;
  state: TopicStateMap;
  /** Lessons earlier in the same subtopic (by authored order). */
  priorLessonIds: readonly string[];
}

/**
 * A lesson unlocks when its topic is ready, its authoring prerequisites are
 * met (completed lesson, or the referenced topic is mastered ≥ TARGET), and
 * every earlier lesson in the subtopic is completed.
 */
export function lessonUnlockState(input: LessonUnlockInput): boolean {
  if (!input.topicReady) return false;
  for (const prereq of input.prerequisites) {
    if (prereq.kind === "lesson") {
      if (!input.completedLessonIds.has(prereq.lessonId)) return false;
    } else {
      const mastery = input.state.get(prereq.topicId)?.mastery ?? 0;
      if (mastery < TARGET) return false;
    }
  }
  return input.priorLessonIds.every((id) => input.completedLessonIds.has(id));
}

export interface TopicReadiness {
  ready: boolean;
  graph: KnowledgeGraph;
  state: TopicStateMap;
  prereqs: PrereqStatus[];
  /** Topic ids in this subject the student self-certified via a readiness pretest. */
  pretestPassed: ReadonlySet<string>;
}

/** One-shot read helper: load the subject graph, derive state, evaluate the gate. */
export async function computeTopicReadiness(
  input: TopicReadyCheck,
): Promise<TopicReadiness> {
  const pretestPassed =
    input.pretestPassed ??
    (await loadPretestPassed(input.prisma, input.studentId, input.subjectId));
  const graph = await loadGraph(input.prisma, input.subjectId);
  const state = await computeTopicState(
    input.prisma,
    input.studentId,
    graph,
    input.now,
  );
  const ready = isAvailable(
    input.topicId,
    state,
    graph,
    pretestPassed,
  );
  return {
    ready,
    graph,
    state,
    prereqs: prereqStatuses(input.topicId, graph, state, pretestPassed),
    pretestPassed,
  };
}

export interface LessonAccess extends TopicReadiness {
  lessonReady: boolean;
}

/**
 * Full per-lesson access check used by the lesson player page: topic gate +
 * lesson-level prerequisites + earlier-lessons-in-subtopic ordering.
 */
export async function computeLessonAccess(
  prisma: Pick<
    PrismaClient,
    | "topic"
    | "topicEdge"
    | "topicMastery"
    | "learningEvent"
    | "studentProgress"
    | "lesson"
    | "performanceMetric"
  >,
  studentId: string,
  subjectId: string,
  topicId: string,
  lessonId: string,
  now = new Date(),
): Promise<LessonAccess> {
  const readiness = await computeTopicReadiness({
    prisma,
    studentId,
    subjectId,
    topicId,
    now,
  });

  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    select: { id: true, subtopicId: true, prerequisites: true },
  });
  if (!lesson) {
    return { ...readiness, lessonReady: false };
  }

  const [siblings, completed, allLessons] = await Promise.all([
    prisma.lesson.findMany({
      where: { subtopicId: lesson.subtopicId },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    }),
    prisma.studentProgress.findMany({
      where: { studentId, status: "COMPLETED", lessonId: { not: null } },
      select: { lessonId: true },
    }),
    prisma.lesson.findMany({
      where: { subtopic: { topic: { subjectId } } },
      select: { id: true, title: true },
    }),
  ]);

  const completedLessonIds = new Set(
    completed
      .map((row) => row.lessonId)
      .filter((id): id is string => id !== null),
  );

  const priorLessonIds: string[] = [];
  for (const sibling of siblings) {
    if (sibling.id === lessonId) break;
    priorLessonIds.push(sibling.id);
  }

  const lessonIdByTitle = new Map(
    allLessons.map((row) => [row.title, row.id]),
  );
  const topicIdByTitle = new Map(
    [...readiness.graph.nodes.values()].map((node) => [node.title, node.id]),
  );
  const prerequisites = resolvePrerequisiteEntries(
    lesson.prerequisites,
    lessonIdByTitle,
    topicIdByTitle,
  );

  const lessonReady = lessonUnlockState({
    topicReady: readiness.ready,
    prerequisites,
    completedLessonIds,
    state: readiness.state,
    priorLessonIds,
  });

  return { ...readiness, lessonReady };
}
