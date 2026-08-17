import { db } from "./db";
import { TRACK_CATEGORIES, relevantTrackCategories } from "./subjects";
import { loadGraph } from "@/engines/learning/graph";
import { computeTopicState } from "@/engines/learning/mastery";
import { isAvailable, loadPretestPassed, TARGET } from "@/engines/learning/availability";
import { recommendNext } from "@/engines/learning/recommend";
import type {
  GraphNodeState,
  GraphViewEdge,
  GraphViewNode,
} from "@/components/path/graph-view";
import type { ClassGroup } from "@/components/classroom/class-term-browser";
import { resolveClassLevel } from "./classroom";
import { CLASS_LEVELS, TERMS, type ClassLevel } from "./curriculum-scope";

export type ClassroomSubject = {
  code: string;
  name: string;
  slug: string;
  trackCategory: string;
  isWaec: boolean;
  isJamb: boolean;
  isNeco: boolean;
  topicCount: number;
  questionCount: number;
};

export type ClassroomListData = {
  /** Subjects grouped by track category, in TRACK_CATEGORIES order. */
  byCategory: Record<string, ClassroomSubject[]>;
  /**
   * Whether the student's track actually narrows the catalogue. When it does
   * not, the "show all" toggle has nothing to reveal and is hidden.
   */
  hasNarrowing: boolean;
};

export async function getClassroomSubjects(
  track: string | null,
  showAll: boolean,
): Promise<ClassroomListData> {
  const relevant = relevantTrackCategories(track);
  const hasNarrowing = relevant.length < TRACK_CATEGORIES.length;

  const subjects = await db.subject.findMany({
    where: showAll || !hasNarrowing ? {} : { trackCategory: { in: [...relevant] } },
    orderBy: [{ trackCategory: "asc" }, { name: "asc" }],
    select: {
      code: true,
      name: true,
      slug: true,
      trackCategory: true,
      isWaec: true,
      isJamb: true,
      isNeco: true,
      _count: { select: { topics: true, questions: true } },
    },
  });

  const byCategory: Record<string, ClassroomSubject[]> = {};
  for (const s of subjects) {
    (byCategory[s.trackCategory] ??= []).push({
      code: s.code,
      name: s.name,
      slug: s.slug,
      trackCategory: s.trackCategory,
      isWaec: s.isWaec,
      isJamb: s.isJamb,
      isNeco: s.isNeco,
      topicCount: s._count.topics,
      questionCount: s._count.questions,
    });
  }

  return { byCategory, hasNarrowing };
}

/** Retention below which a mastered topic is shown as decayed on the graph. */
const REVISION_RETENTION = 0.85;

type TopicRow = {
  id: string;
  title: string;
  slug: string;
  curriculumLevel: { classLevel: string; term: string };
};

export type SubjectPageData = {
  subject: {
    id: string;
    code: string;
    name: string;
    slug: string;
    description: string;
    questionCount: number;
    topicCount: number;
  };
  /** WAEC / JAMB / NECO, in that order, for whichever the subject is sat under. */
  examLabels: string[];
  hasTopics: boolean;
  graphNodes: GraphViewNode[];
  graphEdges: GraphViewEdge[];
  masteredCount: number;
  readyCount: number;
  dueCount: number;
  classes: ClassGroup[];
  initialClassLevel: ClassLevel;
};

/**
 * The subject page: the curriculum browser plus the Learning Path graph view
 * (spec Stage 0). Per-topic state is derived from live evidence and the
 * student's self-certified pretests, so the node colours carry the
 * unlock/mastery/revision signal.
 *
 * Returns null when the subject slug does not resolve.
 */
export async function getSubjectPageData(
  userId: string,
  subjectSlug: string,
  userClassLevel: string | null,
): Promise<SubjectPageData | null> {
  const subject = await db.subject.findUnique({
    where: { slug: subjectSlug },
    include: {
      _count: { select: { questions: true, topics: true } },
      topics: {
        orderBy: { orderIndex: "asc" },
        select: {
          id: true,
          title: true,
          slug: true,
          estimatedMinutes: true,
          curriculumLevel: { select: { classLevel: true, term: true } },
          _count: { select: { questions: true } },
        },
      },
    },
  });
  if (!subject) return null;

  const graph = await loadGraph(db, subject.id);
  const [state, pretestPassed, completedProgress] = await Promise.all([
    computeTopicState(db, userId, graph),
    loadPretestPassed(db, userId, subject.id),
    db.studentProgress.findMany({
      where: {
        studentId: userId,
        subjectId: subject.id,
        status: "COMPLETED",
        topicId: { not: null },
      },
      select: { topicId: true },
    }),
  ]);
  const completedTopicIds = new Set(
    completedProgress.map((p) => p.topicId).filter((id): id is string => id != null),
  );

  const graphNodes: GraphViewNode[] = [];
  let masteredCount = 0;
  let readyCount = 0;
  let dueCount = 0;
  for (const [topicId, node] of graph.nodes) {
    if (node.subjectId !== subject.id) continue;
    const topicState = state.get(topicId);
    const mastery = topicState?.mastery ?? 0;
    const retention = topicState?.retention ?? null;
    const lastStudy = topicState?.lastStudy ?? null;
    const confidence = topicState?.confidence ?? 0;
    const accObservations = topicState?.accObservations ?? 0;
    const lessonObservations = topicState?.lessonObservations ?? 0;
    const srsObservations = topicState?.srsObservations ?? 0;
    const available = isAvailable(topicId, state, graph, pretestPassed);

    let nodeState: GraphNodeState;
    if (retention != null && retention < REVISION_RETENTION) {
      nodeState = "DECAYED";
    } else if (mastery >= TARGET) {
      nodeState = "MASTERED";
    } else if (available && lastStudy != null) {
      nodeState = "STARTED";
    } else if (available) {
      nodeState = "READY";
    } else {
      nodeState = "LOCKED";
    }

    if (nodeState === "MASTERED") masteredCount += 1;
    if (nodeState === "READY") readyCount += 1;
    if (nodeState === "DECAYED") dueCount += 1;

    graphNodes.push({
      id: topicId,
      title: node.title,
      slug: node.slug,
      orderIndex: node.orderIndex,
      state: nodeState,
      mastery,
      confidence,
      accObservations,
      lessonObservations,
      srsObservations,
      isNext: false,
    });
  }

  const nextTopicId =
    recommendNext(state, graph, { k: 1, pretestPassed })[0]?.topicId ?? null;
  for (const node of graphNodes) {
    if (node.id === nextTopicId) node.isNext = true;
  }

  const grouped: Record<string, Record<string, TopicRow[]>> = {};
  for (const level of CLASS_LEVELS) grouped[level] = { FIRST: [], SECOND: [], THIRD: [] };
  for (const topic of subject.topics as TopicRow[]) {
    const { classLevel, term } = topic.curriculumLevel;
    if (!grouped[classLevel]?.[term]) continue;
    grouped[classLevel][term].push(topic);
  }

  const classes: ClassGroup[] = CLASS_LEVELS.map((level) => ({
    classLevel: level,
    terms: TERMS.map((term) => ({
      term,
      topics: grouped[level][term].map((topic) => ({
        slug: topic.slug,
        title: topic.title,
        completed: completedTopicIds.has(topic.id),
      })),
    })),
  }));

  const classesWithTopics = classes
    .filter((group) => group.terms.some((t) => t.topics.length > 0))
    .map((group) => group.classLevel);

  const examLabels: string[] = [];
  if (subject.isWaec) examLabels.push("WAEC");
  if (subject.isJamb) examLabels.push("JAMB");
  if (subject.isNeco) examLabels.push("NECO");

  return {
    subject: {
      id: subject.id,
      code: subject.code,
      name: subject.name,
      slug: subject.slug,
      description: subject.description,
      questionCount: subject._count.questions,
      topicCount: subject._count.topics,
    },
    examLabels,
    hasTopics: subject.topics.length > 0,
    graphNodes,
    graphEdges: graph.edges
      .filter(
        (edge) =>
          graph.nodes.get(edge.from)?.subjectId === subject.id &&
          graph.nodes.get(edge.to)?.subjectId === subject.id,
      )
      .map((edge) => ({ from: edge.from, to: edge.to })),
    masteredCount,
    readyCount,
    dueCount,
    classes,
    initialClassLevel: resolveClassLevel(userClassLevel, classesWithTopics),
  };
}
