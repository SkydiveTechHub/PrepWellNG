import { db } from "./db";
import { computePathState, loadStudentSubjectIds } from "./learning-path";
import {
  keepLearning,
  type NextTopicRecommendation,
} from "@/engines/learning/recommend";
import { gapQueue, type TopicGap } from "@/engines/learning/gaps";
import {
  loadRevisionExtras,
  revisionItemToRecommendation,
  revisionQueue,
  type RevisionQueueItem,
} from "@/engines/learning/revision";

/** A subject referenced by a learning-path card, keyed by id in the payload. */
export type DashboardSubject = {
  slug: string;
  name: string;
  code: string;
};

/**
 * A recent attempt as the dashboard renders it. `assessment.title` is flattened
 * to `title`, and `completedAt` is an ISO string rather than a `Date` — the
 * payload has to survive JSON, so it never carries a live Date across the
 * boundary.
 */
export type DashboardAttempt = {
  id: string;
  title: string;
  percentage: number | null;
  completedAt: string | null;
};

/** Everything the dashboard renders. JSON-representable end to end. */
export type DashboardData = {
  totalResponses: number;
  accuracy: number | null;
  topicCount: number;
  lastWeekActivity: number;
  /**
   * Whether the student has engaged anywhere — a quiz, a completed lesson, or a
   * flashcard review. The learning-path sections stay hidden until they have.
   */
  hasActivity: boolean;
  hasStudyPlan: boolean;
  bestScore: number | null;
  recentAttempts: DashboardAttempt[];
  subjects: Record<string, DashboardSubject>;
  learningPicks: NextTopicRecommendation[];
  gaps: TopicGap[];
  revision: RevisionQueueItem[];
};

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** How many cards the "Keep learning" rail shows. */
const KEEP_LEARNING_K = 3;

/**
 * How far back the recent-lesson scan reads. More than KEEP_LEARNING_K because
 * the rail shows one card per topic, and a student working through one topic
 * generates several lesson rows for it.
 */
const RECENT_LESSON_SCAN = 12;

/** The eight counters behind the hero and the stat row, in one round trip. */
async function loadStats(userId: string) {
  const [
    totalResponses,
    correctResponses,
    distinctTopics,
    recentAttempts,
    lastWeekActivity,
    lessonActivity,
    reviewCount,
    activePlanCount,
  ] = await db.$transaction([
    db.questionResponse.count({
      where: { attempt: { studentId: userId } },
    }),
    db.questionResponse.count({
      where: { attempt: { studentId: userId }, isCorrect: true },
    }),
    db.questionResponse.findMany({
      where: { attempt: { studentId: userId }, question: { topicId: { not: null } } },
      select: { question: { select: { topicId: true } } },
      distinct: ["questionId"],
    }),
    db.assessmentAttempt.findMany({
      where: { studentId: userId, status: "COMPLETED" },
      orderBy: { completedAt: "desc" },
      take: 5,
      select: {
        id: true,
        percentage: true,
        completedAt: true,
        assessment: { select: { title: true } },
      },
    }),
    db.assessmentAttempt.count({
      where: {
        studentId: userId,
        status: "COMPLETED",
        completedAt: { gte: new Date(Date.now() - WEEK_MS) },
      },
    }),
    // Started, not finished: opening a lesson is activity, and the "Keep
    // learning" rail keys off the same rows — a student whose only engagement
    // is an in-progress lesson would otherwise be told they have no activity
    // while the rail has something to say about them.
    db.studentProgress.count({
      where: {
        studentId: userId,
        status: { not: "NOT_STARTED" },
        lessonId: { not: null },
      },
    }),
    db.flashcardReview.count({ where: { studentId: userId } }),
    // Counted rather than fetched: the hero only needs to know whether a plan
    // exists, and it rides along in the transaction already being run.
    db.studyPlan.count({ where: { studentId: userId, isActive: true } }),
  ]);

  const topicCount = new Set(
    distinctTopics.map((r) => r.question.topicId).filter(Boolean),
  ).size;
  const accuracy =
    totalResponses > 0 ? Math.round((correctResponses / totalResponses) * 100) : null;

  return {
    totalResponses,
    accuracy,
    topicCount,
    recentAttempts,
    lastWeekActivity,
    lessonActivity,
    reviewCount,
    hasStudyPlan: activePlanCount > 0,
  };
}

/**
 * Learning Path Engine — next-topic recommendations, gaps and the revision
 * queue, derived on read from the student's live progress across their
 * subjects. Only called once the student has activity: the derivation is heavy
 * and has nothing to say about a brand-new account.
 */
async function loadLearningPath(userId: string) {
  const subjectIds = await loadStudentSubjectIds(db, userId);
  const subjectRows = await db.subject.findMany({
    where: { id: { in: subjectIds } },
    select: { id: true, slug: true, name: true, code: true },
  });

  const subjects: Record<string, DashboardSubject> = {};
  for (const row of subjectRows) {
    subjects[row.id] = { slug: row.slug, name: row.name, code: row.code };
  }

  const { state, graph, pretestPassed } = await computePathState(db, userId, subjectIds);
  const now = new Date();
  const revisionExtras = await loadRevisionExtras(db, userId, graph, now);
  const revision = revisionQueue(state, graph, revisionExtras, { now, k: 6 });

  // The rail leads with the student's own recent lessons — see keepLearning.
  // Newest first, one row per lesson, so a topic can repeat; keepLearning
  // collapses the duplicates.
  const recentLessonRows = await db.studentProgress.findMany({
    where: {
      studentId: userId,
      lessonId: { not: null },
      topicId: { not: null },
      status: { not: "NOT_STARTED" },
    },
    // Nulls last, not Postgres' DESC default of nulls first: a row that has
    // never been accessed is the least recent thing there is, not the most.
    orderBy: { lastAccessedAt: { sort: "desc", nulls: "last" } },
    take: RECENT_LESSON_SCAN,
    select: { topicId: true },
  });
  const recentLessonTopicIds = recentLessonRows
    .map((row) => row.topicId)
    .filter((id): id is string => id !== null);

  // Algorithm C's consolidation fallback: when neither the student's recent
  // lessons nor the engine has anything to offer, the "Keep learning" rail
  // hands off to the merged revision queue.
  const nextTopics = keepLearning(state, graph, recentLessonTopicIds, {
    k: KEEP_LEARNING_K,
    now,
    pretestPassed,
  });
  const learningPicks =
    nextTopics.length > 0
      ? nextTopics
      : revision.slice(0, KEEP_LEARNING_K).map(revisionItemToRecommendation);

  // Display-only, so it is loaded here rather than folded into the aggregate:
  // rare, and read on one surface. Same pattern as `pretestPassed`.
  //
  // Decoration, not diagnosis: if this fails the gap list loses its reason
  // lines, which is a far better outcome than failing the dashboard.
  let abandonedByTopic = new Map<string, number>();
  try {
    const abandonedRows = await db.learningEvent.groupBy({
      by: ["topicId"],
      where: { studentId: userId, kind: "QUIZ_ABANDONED", topicId: { not: null } },
      _count: { _all: true },
    });
    abandonedByTopic = new Map(
      abandonedRows
        .filter((row): row is typeof row & { topicId: string } => row.topicId !== null)
        .map((row) => [row.topicId, row._count._all]),
    );
  } catch (error) {
    console.error("Loading abandonment counts failed:", error);
  }

  return {
    subjects,
    learningPicks,
    gaps: gapQueue(state, graph, pretestPassed, abandonedByTopic),
    revision,
  };
}

export async function getDashboardData(userId: string): Promise<DashboardData> {
  const stats = await loadStats(userId);

  const hasActivity =
    stats.totalResponses > 0 || stats.lessonActivity > 0 || stats.reviewCount > 0;

  const path = hasActivity
    ? await loadLearningPath(userId)
    : { subjects: {}, learningPicks: [], gaps: [], revision: [] };

  const bestScore = stats.recentAttempts.length
    ? Math.max(...stats.recentAttempts.map((a) => a.percentage ?? 0))
    : null;

  return {
    totalResponses: stats.totalResponses,
    accuracy: stats.accuracy,
    topicCount: stats.topicCount,
    lastWeekActivity: stats.lastWeekActivity,
    hasActivity,
    hasStudyPlan: stats.hasStudyPlan,
    bestScore,
    recentAttempts: stats.recentAttempts.map((a) => ({
      id: a.id,
      title: a.assessment.title,
      percentage: a.percentage,
      completedAt: a.completedAt?.toISOString() ?? null,
    })),
    subjects: path.subjects,
    learningPicks: path.learningPicks,
    gaps: path.gaps,
    revision: path.revision,
  };
}
