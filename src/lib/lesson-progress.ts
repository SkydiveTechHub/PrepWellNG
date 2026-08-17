import type { Prisma, ProgressStatus } from "@prisma/client";
import { db } from "./db";

export type LessonProgressPatch = {
  status?: ProgressStatus;
  completionPercent?: number;
  checkpointData?: Prisma.InputJsonValue;
  masteryScore?: number;
  timeSpentMinutes?: number;
};

/**
 * Persists the lesson player's checkpoint state (visited cards, knowledge-check
 * results) and derived progress fields onto the student's StudentProgress row.
 *
 * The lesson's subject and topic are resolved from the lesson itself rather
 * than trusted from the request. Returns `"lesson-not-found"` for an unknown id.
 */
export async function saveLessonProgress(
  studentId: string,
  lessonId: string,
  patch: LessonProgressPatch,
) {
  const lesson = await db.lesson.findUnique({
    where: { id: lessonId },
    include: {
      subtopic: { include: { topic: { select: { subjectId: true } } } },
    },
  });
  if (!lesson) return "lesson-not-found" as const;

  const subjectId = lesson.subtopic.topic.subjectId;
  const topicId = lesson.subtopic.topicId;
  const { status, completionPercent, checkpointData, masteryScore, timeSpentMinutes } =
    patch;

  const changed = {
    ...(status !== undefined && { status }),
    ...(completionPercent !== undefined && { completionPercent }),
    ...(checkpointData !== undefined && { checkpointData }),
    // masteryScore written here is NOT evidence. Since the learning evidence
    // layer landed, mastery is derived from the LearningEvent ledger, not from
    // this column. Nothing currently posts masteryScore; if you wire a client
    // to, emit a LESSON_BLOCK_COMPLETED event alongside this write or the work
    // will not count towards mastery.
    // See docs/superpowers/specs/2026-08-11-learning-evidence-layer-design.md
    ...(masteryScore !== undefined && { masteryScore }),
    ...(timeSpentMinutes !== undefined && { timeSpentMinutes }),
    lastAccessedAt: new Date(),
  };

  return db.studentProgress.upsert({
    where: {
      studentId_subjectId_topicId_lessonId: {
        studentId,
        subjectId,
        topicId,
        lessonId,
      },
    },
    create: {
      studentId,
      subjectId,
      topicId,
      lessonId,
      status: status ?? "IN_PROGRESS",
      completionPercent: completionPercent ?? 0,
      ...(checkpointData !== undefined && { checkpointData }),
      ...(masteryScore !== undefined && { masteryScore }),
      ...(timeSpentMinutes !== undefined && { timeSpentMinutes }),
      lastAccessedAt: new Date(),
    },
    update: changed,
  });
}

export type TopicRef = {
  subjectId: string;
  subjectName: string;
  topicId: string;
  topicTitle: string;
  questionCount: number;
};

/**
 * Resolves a topic (and its subject) from slugs so client components can
 * generate quizzes. Returns which half of the lookup missed, so the caller can
 * keep its distinct 404 messages.
 */
export async function resolveTopicRef(
  subjectSlug: string,
  topicSlug: string,
): Promise<TopicRef | "subject-not-found" | "topic-not-found"> {
  const subject = await db.subject.findUnique({
    where: { slug: subjectSlug },
    select: { id: true, name: true },
  });
  if (!subject) return "subject-not-found";

  const topic = await db.topic.findUnique({
    where: { subjectId_slug: { subjectId: subject.id, slug: topicSlug } },
    select: { id: true, title: true, _count: { select: { questions: true } } },
  });
  if (!topic) return "topic-not-found";

  return {
    subjectId: subject.id,
    subjectName: subject.name,
    topicId: topic.id,
    topicTitle: topic.title,
    questionCount: topic._count.questions,
  };
}
