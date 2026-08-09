import { db } from "./db";
import { resolveTopicLesson, topicLessonSelect } from "./classroom";
import {
  bestOfLastThree,
  computeMasteryScore,
  kcAccuracyFromCheckpoints,
  masteryLevelFromScore,
  nextRevisionDate,
  parseCheckpointState,
} from "./lesson-engine";

export type PracticeMissedQuestion = {
  id: string;
  questionText: string;
  options: Record<string, string> | null;
  correctAnswer: string;
  explanation: string | null;
};

export type TopicPracticeResult = {
  topicTitle: string;
  passMarkPercent: number;
  percentage: number;
  passed: boolean;
  bestMastery: number;
  masteryLevel: string;
  score: number | null;
  totalMarks: number | null;
  completedAt: string | null;
  /** When the next revision falls due, ISO. Only meaningful when passed. */
  nextRevisionAt: string;
  missed: PracticeMissedQuestion[];
};

/**
 * Why the result page could not be rendered, so the caller can pick the right
 * Next.js response — `notFound()` versus a redirect back into the lesson.
 */
export type TopicPracticeResultOutcome =
  | { status: "not-found" }
  | { status: "no-lesson" }
  | { status: "no-attempt" }
  | { status: "ok"; result: TopicPracticeResult };

/**
 * Scores a finished topic practice attempt and records the progress it earned.
 *
 * NOTE: this writes. It is called during a page render, so a browser refresh
 * re-records the attempt against the student's practice history. That predates
 * this extraction and is left as-is here, but it belongs in a POST — see the
 * note in the accompanying refactor summary.
 */
export async function recordTopicPracticeResult(
  userId: string,
  subjectSlug: string,
  topicSlug: string,
  attemptId: string,
): Promise<TopicPracticeResultOutcome> {
  const subject = await db.subject.findUnique({
    where: { slug: subjectSlug },
    select: { id: true, name: true },
  });
  if (!subject) return { status: "not-found" };

  const topic = await db.topic.findUnique({
    where: { subjectId_slug: { subjectId: subject.id, slug: topicSlug } },
    select: { id: true, title: true, subtopics: topicLessonSelect },
  });
  if (!topic) return { status: "not-found" };

  const lesson = resolveTopicLesson(topic);
  if (!lesson) return { status: "no-lesson" };

  const attempt = await db.assessmentAttempt.findFirst({
    where: { id: attemptId, studentId: userId, status: "COMPLETED" },
    include: {
      responses: {
        include: { question: true },
        orderBy: { id: "asc" },
      },
    },
  });
  if (!attempt) return { status: "no-attempt" };

  const subjectId = subject.id;
  const topicId = topic.id;
  const lessonId = lesson.id;
  const percentage = attempt.percentage ?? 0;
  const passed = percentage >= lesson.passMarkPercent;

  const progress = await db.studentProgress.findUnique({
    where: {
      studentId_subjectId_topicId_lessonId: {
        studentId: userId,
        subjectId,
        topicId,
        lessonId,
      },
    },
  });

  // Mastery = best of the last 3 practice attempts; each attempt scores
  // 0.3 × KC accuracy + 0.7 × practice accuracy.
  const checkpoint = parseCheckpointState(progress?.checkpointData);
  const kcScore = kcAccuracyFromCheckpoints(checkpoint.checks);
  const practiceRecords = [
    ...(checkpoint.practice ?? []),
    { attemptId, percentage, passed, at: new Date().toISOString() },
  ];
  const compositeScores = practiceRecords.map((p) =>
    computeMasteryScore(kcScore, p.percentage / 100),
  );
  const bestMastery = bestOfLastThree(compositeScores);
  const masteryLevel = masteryLevelFromScore(bestMastery);
  const revisionDueAt = nextRevisionDate(new Date(), lesson.revisionDays);

  if (passed) {
    await db.$transaction([
      db.studentProgress.upsert({
        where: {
          studentId_subjectId_topicId_lessonId: {
            studentId: userId,
            subjectId,
            topicId,
            lessonId,
          },
        },
        create: {
          studentId: userId,
          subjectId,
          topicId,
          lessonId,
          status: "COMPLETED",
          completionPercent: 100,
          checkpointData: { ...checkpoint, practice: practiceRecords },
          masteryScore: bestMastery,
          revisionDueAt,
        },
        update: {
          status: "COMPLETED",
          completionPercent: 100,
          checkpointData: { ...checkpoint, practice: practiceRecords },
          masteryScore: bestMastery,
          revisionDueAt,
          lastAccessedAt: new Date(),
        },
      }),
      db.performanceMetric.upsert({
        where: {
          studentId_subjectId_topicId: { studentId: userId, subjectId, topicId },
        },
        create: {
          studentId: userId,
          subjectId,
          topicId,
          masteryLevel,
          lastUpdated: new Date(),
        },
        update: { masteryLevel, lastUpdated: new Date() },
      }),
    ]);
  } else {
    await db.studentProgress.upsert({
      where: {
        studentId_subjectId_topicId_lessonId: {
          studentId: userId,
          subjectId,
          topicId,
          lessonId,
        },
      },
      create: {
        studentId: userId,
        subjectId,
        topicId,
        lessonId,
        status: "IN_PROGRESS",
        completionPercent: progress?.completionPercent ?? 0,
        checkpointData: { ...checkpoint, practice: practiceRecords },
      },
      update: {
        status: "IN_PROGRESS",
        checkpointData: { ...checkpoint, practice: practiceRecords },
        lastAccessedAt: new Date(),
      },
    });
  }

  return {
    status: "ok",
    result: {
      topicTitle: topic.title,
      passMarkPercent: lesson.passMarkPercent,
      percentage,
      passed,
      bestMastery,
      masteryLevel,
      score: attempt.score,
      totalMarks: attempt.totalMarks,
      completedAt: attempt.completedAt?.toISOString() ?? null,
      nextRevisionAt: revisionDueAt.toISOString(),
      missed: attempt.responses
        .filter((r) => r.isCorrect === false)
        .map((r) => ({
          id: r.id,
          questionText: r.question.questionText,
          options: (r.question.options as Record<string, string> | null) ?? null,
          correctAnswer: r.question.correctAnswer,
          explanation: r.question.explanation,
        })),
    },
  };
}
