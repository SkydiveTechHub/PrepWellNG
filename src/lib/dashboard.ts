import { db } from "./db";
import { computePathState, loadStudentSubjectIds } from "./learning-path";
import {
  recommendNext,
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

/** The eight counters behind the hero and the stat row, in one round trip. */
async function loadStats(userId: string) {
  const [
    totalResponses,
    correctResponses,
    distinctTopics,
    recentAttempts,
    lastWeekActivity,
    completedLessons,
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
    db.studentProgress.count({
      where: { studentId: userId, status: "COMPLETED", lessonId: { not: null } },
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
    completedLessons,
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

  // Algorithm C's consolidation fallback: when nothing is available to learn,
  // the "Keep learning" rail hands off to the merged revision queue.
  const nextTopics = recommendNext(state, graph, { k: 3, pretestPassed });
  const learningPicks =
    nextTopics.length > 0
      ? nextTopics
      : revision.slice(0, 3).map(revisionItemToRecommendation);

  return { subjects, learningPicks, gaps: gapQueue(state, graph, pretestPassed), revision };
}

export async function getDashboardData(userId: string): Promise<DashboardData> {
  const stats = await loadStats(userId);

  const hasActivity =
    stats.totalResponses > 0 || stats.completedLessons > 0 || stats.reviewCount > 0;

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
