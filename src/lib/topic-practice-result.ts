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
import { withPracticeRecord } from "./lesson-progress-rules";

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
 * Loads everything both the read and the write path need, and derives the
 * scoring from it. Writes nothing.
 *
 * Both paths compute from the same inputs, so the result page shows the same
 * numbers whether or not the recording has landed yet — the attempt it is
 * scoring is included in the practice history either way.
 */
async function loadTopicPractice(
  userId: string,
  subjectSlug: string,
  topicSlug: string,
  attemptId: string,
) {
  const subject = await db.subject.findUnique({
    where: { slug: subjectSlug },
    select: { id: true, name: true },
  });
  if (!subject) return { status: "not-found" as const };

  const topic = await db.topic.findUnique({
    where: { subjectId_slug: { subjectId: subject.id, slug: topicSlug } },
    select: { id: true, title: true, subtopics: topicLessonSelect },
  });
  if (!topic) return { status: "not-found" as const };

  const lesson = resolveTopicLesson(topic);
  if (!lesson) return { status: "no-lesson" as const };

  const attempt = await db.assessmentAttempt.findFirst({
    where: { id: attemptId, studentId: userId, status: "COMPLETED" },
    include: {
      responses: {
        include: { question: true },
        orderBy: { id: "asc" },
      },
    },
  });
  if (!attempt) return { status: "no-attempt" as const };

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
  // One entry per attempt, however many times this runs for it: the same
  // attempt recorded twice would count twice towards the best-of-three.
  const practiceRecords = withPracticeRecord(checkpoint.practice, {
    attemptId,
    percentage,
    passed,
    at: new Date().toISOString(),
  });
  const compositeScores = practiceRecords.map((p) =>
    computeMasteryScore(kcScore, p.percentage / 100),
  );
  const bestMastery = bestOfLastThree(compositeScores);
  const masteryLevel = masteryLevelFromScore(bestMastery);
  const revisionDueAt = nextRevisionDate(new Date(), lesson.revisionDays);

  // The ledger is append-only: emitting again would fold one lesson completion
  // as several independent observations, permanently inflating the lesson
  // channel. A re-submit of the same attempt must therefore stay silent.
  const alreadyRecorded = (checkpoint.practice ?? []).some(
    (record) => record.attemptId === attemptId,
  );

  return {
    status: "ok" as const,
    data: {
      userId,
      subjectId,
      topicId,
      lessonId,
      topicTitle: topic.title,
      passMarkPercent: lesson.passMarkPercent,
      attempt,
      progress,
      checkpoint,
      practiceRecords,
      percentage,
      passed,
      bestMastery,
      masteryLevel,
      revisionDueAt,
      alreadyRecorded,
    },
  };
}

type LoadedPractice = Extract<
  Awaited<ReturnType<typeof loadTopicPractice>>,
  { status: "ok" }
>["data"];

/**
 * The result page's read model. Writes nothing — a refresh of the result URL
 * re-renders the same numbers without touching the student's record.
 */
export async function getTopicPracticeResult(
  userId: string,
  subjectSlug: string,
  topicSlug: string,
  attemptId: string,
): Promise<TopicPracticeResultOutcome> {
  const loaded = await loadTopicPractice(userId, subjectSlug, topicSlug, attemptId);
  if (loaded.status !== "ok") return { status: loaded.status };
  return { status: "ok", result: toResult(loaded.data) };
}

/**
 * Records the progress a finished practice attempt earned: completion when it
 * passed, the attempt in the practice history either way, the topic's mastery
 * level, and one LESSON_COMPLETED event per genuine pass.
 *
 * Called from the submit endpoint (inside `after()`), never from a render.
 * Idempotent per attempt, so a re-submit of an already-graded attempt replays
 * without double-counting it.
 */
export async function recordTopicPracticeResult(
  userId: string,
  subjectSlug: string,
  topicSlug: string,
  attemptId: string,
): Promise<TopicPracticeResultOutcome> {
  const loaded = await loadTopicPractice(userId, subjectSlug, topicSlug, attemptId);
  if (loaded.status !== "ok") return { status: loaded.status };

  const {
    subjectId,
    topicId,
    lessonId,
    checkpoint,
    practiceRecords,
    progress,
    passed,
    bestMastery,
    masteryLevel,
    revisionDueAt,
    alreadyRecorded,
  } = loaded.data;

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
      ...(alreadyRecorded
        ? []
        : [
            db.learningEvent.createMany({
              data: [
                {
                  studentId: userId,
                  subjectId,
                  topicId,
                  kind: "LESSON_COMPLETED" as const,
                  // NOTE: `score` here is bestOfLastThree, itself an aggregate over attempts.
                  // A genuine re-pass therefore emits a restatement of a running best, which the
                  // fold counts as a fresh observation — unlike the practice and SRS channels,
                  // which emit one event per new observation. Deliberate for now; revisit if the
                  // lesson channel starts over-weighting repeat learners.
                  score: bestMastery / 100,
                  sourceId: lessonId,
                },
              ],
            }),
          ]),
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
      // A failed retake records the attempt but must not revoke a completion
      // the student already earned — passing once is passing.
      update: {
        ...(progress?.status === "COMPLETED" ? {} : { status: "IN_PROGRESS" }),
        checkpointData: { ...checkpoint, practice: practiceRecords },
        lastAccessedAt: new Date(),
      },
    });
  }

  return { status: "ok", result: toResult(loaded.data) };
}

/** The display payload, derived from the same numbers the write path stores. */
function toResult(data: LoadedPractice): TopicPracticeResult {
  return {
    topicTitle: data.topicTitle,
    passMarkPercent: data.passMarkPercent,
    percentage: data.percentage,
    passed: data.passed,
    bestMastery: data.bestMastery,
    masteryLevel: data.masteryLevel,
    score: data.attempt.score,
    totalMarks: data.attempt.totalMarks,
    completedAt: data.attempt.completedAt?.toISOString() ?? null,
    nextRevisionAt: data.revisionDueAt.toISOString(),
    missed: data.attempt.responses
      .filter((r) => r.isCorrect === false)
      .map((r) => ({
        id: r.id,
        questionText: r.question.questionText,
        options: (r.question.options as Record<string, string> | null) ?? null,
        correctAnswer: r.question.correctAnswer,
        explanation: r.question.explanation,
      })),
  };
}
