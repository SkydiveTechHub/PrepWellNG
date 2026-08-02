import type { PrismaClient } from "@prisma/client";
import {
  loadGraph,
  type GraphEdge,
  type GraphNode,
  type KnowledgeGraph,
} from "@/engines/learning/graph";
import {
  computeTopicState,
  type TopicStateMap,
} from "@/engines/learning/mastery";

// Learning Path Engine — facade: one call to derive the path state for a
// student across the subjects they study.
// See docs/superpowers/specs/2026-08-02-learning-path-engine-design.md

export interface PathState {
  graph: KnowledgeGraph;
  state: TopicStateMap;
}

/**
 * Merges each subject's graph into one combined DAG. Cross-subject CORE
 * prerequisites appear once, and duplicate `from->to` edges collapse so the
 * downstream algorithms never double-count leverage.
 */
export async function loadCombinedGraph(
  prisma: Pick<PrismaClient, "topic" | "topicEdge">,
  subjectIds: readonly string[],
): Promise<KnowledgeGraph> {
  const graphs = await Promise.all(
    subjectIds.map((subjectId) => loadGraph(prisma, subjectId)),
  );

  const nodes = new Map<string, GraphNode>();
  for (const graph of graphs) {
    for (const [id, node] of graph.nodes) nodes.set(id, node);
  }

  const seen = new Set<string>();
  const edges: GraphEdge[] = [];
  for (const graph of graphs) {
    for (const edge of graph.edges) {
      const key = `${edge.from}->${edge.to}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push(edge);
    }
  }

  return { nodes, edges };
}

/**
 * The subjects a student actually studies, derived from activity
 * (lesson/practice progress, completed assessment attempts, flashcard
 * enrollments). Falls back to every subject when there is no activity yet.
 */
export async function loadStudentSubjectIds(
  prisma: Pick<
    PrismaClient,
    "studentProgress" | "assessmentAttempt" | "flashcardEnrollment" | "subject"
  >,
  studentId: string,
): Promise<string[]> {
  const [progressRows, attemptRows, enrollmentRows] = await Promise.all([
    prisma.studentProgress.findMany({
      where: { studentId },
      distinct: ["subjectId"],
      select: { subjectId: true },
    }),
    prisma.assessmentAttempt.findMany({
      where: { studentId, status: "COMPLETED" },
      select: { assessment: { select: { subjectId: true } } },
    }),
    prisma.flashcardEnrollment.findMany({
      where: { studentId },
      select: { deck: { select: { subjectId: true } } },
    }),
  ]);

  const subjectIds = new Set<string>();
  for (const row of progressRows) subjectIds.add(row.subjectId);
  for (const row of attemptRows) {
    if (row.assessment.subjectId) subjectIds.add(row.assessment.subjectId);
  }
  for (const row of enrollmentRows) {
    if (row.deck.subjectId) subjectIds.add(row.deck.subjectId);
  }

  if (subjectIds.size === 0) {
    const all = await prisma.subject.findMany({ select: { id: true } });
    return all.map((subject) => subject.id);
  }
  return [...subjectIds];
}

/** One call: combined graph + derived per-topic state. */
export async function computePathState(
  prisma: Pick<
    PrismaClient,
    "topic" | "topicEdge" | "questionResponse" | "studentProgress" | "flashcardReview"
  >,
  studentId: string,
  subjectIds: readonly string[],
  now = new Date(),
): Promise<PathState> {
  const graph = await loadCombinedGraph(prisma, subjectIds);
  const state = await computeTopicState(prisma, studentId, graph, now);
  return { graph, state };
}
