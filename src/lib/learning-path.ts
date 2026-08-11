import type { PrismaClient } from "@prisma/client";
import {
  EDGE_SELECT,
  TOPIC_SELECT,
  buildGraph,
  type GraphEdge,
  type GraphNode,
  type KnowledgeGraph,
} from "@/engines/learning/graph";
import {
  computeTopicState,
  type TopicStateMap,
} from "@/engines/learning/mastery";
import { relevantTrackCategories } from "@/lib/subjects";

// Learning Path Engine — facade: one call to derive the path state for a
// student across the subjects they study.
// See docs/superpowers/specs/2026-08-02-learning-path-engine-design.md

export interface PathState {
  graph: KnowledgeGraph;
  state: TopicStateMap;
  /** Topic ids self-certified via a readiness pretest, across the chosen subjects. */
  pretestPassed: ReadonlySet<string>;
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
  // Batch-load the whole catalog in a handful of queries instead of one
  // per-subject load. A brand-new student has no activity, so `subjectIds` is
  // every subject (44+); per-subject loading fires dozens of round-trips at the
  // Supabase pooler (connection_limit=5), which exhausts the pool and times out
  // (P2024) or takes minutes.
  const topics = await prisma.topic.findMany({
    where: { subjectId: { in: [...subjectIds] } },
    orderBy: { orderIndex: "asc" },
    select: TOPIC_SELECT,
  });
  const topicIds = topics.map((topic) => topic.id);

  const edgeRows = await prisma.topicEdge.findMany({
    where: {
      OR: [{ prereqTopicId: { in: topicIds } }, { topicId: { in: topicIds } }],
    },
    select: EDGE_SELECT,
  });

  let edges: GraphEdge[] = edgeRows.map((row) => ({
    id: row.id,
    from: row.prereqTopicId,
    to: row.topicId,
    kind: row.kind,
    strength: row.strength,
    rationale: row.rationale,
  }));

  // Preserve loadGraph's per-subject legacy fallback: a subject with no
  // authored edges derives its edges from the scalar prerequisiteTopicId.
  const byId = new Map(topics.map((topic) => [topic.id, topic]));
  const subjectsWithEdges = new Set<string>();
  for (const row of edgeRows) {
    const fromSubject = byId.get(row.prereqTopicId)?.subjectId;
    const toSubject = byId.get(row.topicId)?.subjectId;
    if (fromSubject) subjectsWithEdges.add(fromSubject);
    if (toSubject) subjectsWithEdges.add(toSubject);
  }
  const legacyEdges: GraphEdge[] = [];
  for (const topic of topics) {
    if (subjectsWithEdges.has(topic.subjectId)) continue;
    if (topic.prerequisiteTopicId && topic.prerequisiteTopicId !== topic.id) {
      legacyEdges.push({
        id: `legacy:${topic.prerequisiteTopicId}->${topic.id}`,
        from: topic.prerequisiteTopicId,
        to: topic.id,
        kind: "PREREQUISITE" as const,
        strength: 1,
        rationale: null,
      });
    }
  }
  edges = [...edges, ...legacyEdges];

  // Pull in CORE prereq topics from outside the requested subjects — the
  // cross-subject edges reference them.
  const referenced = new Set<string>(
    edges.flatMap((edge) => [edge.from, edge.to]),
  );
  const extraTopics = await prisma.topic.findMany({
    where: { id: { in: [...referenced] }, NOT: { id: { in: topicIds } } },
    select: TOPIC_SELECT,
  });

  // Merge everything into one graph, collapsing duplicate `from->to` edges
  // (cross-subject CORE prerequisites appear once) so the downstream
  // algorithms never double-count leverage.
  const nodes = new Map<string, GraphNode>();
  for (const topic of topics) nodes.set(topic.id, topic as GraphNode);
  for (const topic of extraTopics) nodes.set(topic.id, topic as GraphNode);

  const seen = new Set<string>();
  const merged: GraphEdge[] = [];
  for (const edge of edges) {
    const key = `${edge.from}->${edge.to}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(edge);
  }

  return buildGraph([...nodes.values()], merged);
}

/**
 * The subjects a student actually studies, derived from activity
 * (lesson/practice progress, completed assessment attempts, flashcard
 * enrollments). Falls back to the student's track-relevant subjects (CORE +
 * track) when there is no activity yet, so a brand-new Science, Arts or
 * Commercial student never gets an irrelevant catalog (e.g. Physics for a
 * Commercial student) on the dashboard.
 */
export async function loadStudentSubjectIds(
  prisma: Pick<
    PrismaClient,
    | "studentProgress"
    | "assessmentAttempt"
    | "flashcardEnrollment"
    | "subject"
    | "user"
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
    const user = await prisma.user.findUnique({
      where: { id: studentId },
      select: { track: true },
    });
    const relevant = relevantTrackCategories(user?.track ?? null);
    const subjects = await prisma.subject.findMany({
      where: { trackCategory: { in: [...relevant] } },
      select: { id: true },
    });
    return subjects.map((subject) => subject.id);
  }
  return [...subjectIds];
}

/** One call: combined graph + derived per-topic state + self-certified pretests. */
export async function computePathState(
  prisma: Pick<
    PrismaClient,
    | "topic"
    | "topicEdge"
    | "topicMastery"
    | "learningEvent"
    | "performanceMetric"
  >,
  studentId: string,
  subjectIds: readonly string[],
  now = new Date(),
): Promise<PathState> {
  const graph = await loadCombinedGraph(prisma, subjectIds);
  const state = await computeTopicState(prisma, studentId, graph, now);

  const metricRows = await prisma.performanceMetric.findMany({
    where: {
      studentId,
      subjectId: { in: [...subjectIds] },
      topicId: { not: null },
      pretestPassedAt: { not: null },
    },
    select: { topicId: true },
  });
  const pretestPassed = new Set(
    metricRows
      .map((row) => row.topicId)
      .filter((id): id is string => id !== null),
  );

  return { graph, state, pretestPassed };
}
