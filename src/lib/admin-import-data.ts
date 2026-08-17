import { Prisma } from "@prisma/client";
import { db } from "./db";
import { checkTopicOwnership } from "./admin-question";
import { buildLessonUpdate } from "./admin-lesson";
import { resolveTopicLesson, topicLessonSelectWith } from "./classroom";
import type { validateLessonMarkdown } from "./lesson-markdown";

/**
 * Bulk-import database work for the admin importers. Validation, audit logging
 * and cache revalidation stay with the route handlers.
 */

type ParsedLesson = ReturnType<typeof validateLessonMarkdown>;

export type LessonImportResult =
  | { outcome: "unknown-topic" }
  | {
      outcome: "ok";
      lessonId: string;
      topicTitle: string;
      subjectName: string;
      blockCount: number;
    };

/**
 * Replaces a topic's lesson from already-validated markdown.
 *
 * This route is the one place that can create a *second* lesson under an
 * existing subtopic, so it is the reason the canonical ordering matters at all:
 * resolving the overwrite target by database order would let an admin overwrite
 * a lesson the Classroom (which orders by `createdAt`) never renders.
 */
export async function importLesson(
  topicId: string,
  markdown: string,
  parsed: ParsedLesson,
  actorId: string,
): Promise<LessonImportResult> {
  const topic = await db.topic.findUnique({
    where: { id: topicId },
    select: {
      id: true,
      title: true,
      subject: { select: { name: true } },
      subtopics: topicLessonSelectWith({ id: true }, { id: true }),
    },
  });
  if (!topic) return { outcome: "unknown-topic" };

  const update = buildLessonUpdate(parsed, markdown, actorId);
  // `blocks` is a Json column. Prisma types it as InputJsonValue, which a
  // LessonBlock[] does not structurally satisfy (optional fields typed as
  // `T | undefined`), so the cast is required — not laziness.
  const blocksJson = update.blocks as unknown as Prisma.InputJsonValue;

  // A topic with no subtopic or lesson yet is not an error — a newly added
  // topic must be authorable without running the seed first.
  let subtopicId = topic.subtopics[0]?.id;
  if (!subtopicId) {
    const created = await db.subtopic.create({
      data: { topicId: topic.id, title: "Core Concepts", orderIndex: 0 },
      select: { id: true },
    });
    subtopicId = created.id;
  }

  const lessonId = resolveTopicLesson(topic)?.id;
  const lesson = lessonId
    ? await db.lesson.update({
        where: { id: lessonId },
        data: { ...update, blocks: blocksJson },
        select: { id: true },
      })
    : await db.lesson.create({
        data: {
          subtopicId,
          title: update.title ?? topic.title,
          content: update.content,
          blocks: blocksJson,
          createdBy: update.createdBy,
          summary: update.summary,
          estimatedMinutes: update.estimatedMinutes,
          difficulty: update.difficulty,
          passMarkPercent: update.passMarkPercent,
          practiceCount: update.practiceCount,
        },
        select: { id: true },
      });

  return {
    outcome: "ok",
    lessonId: lesson.id,
    topicTitle: topic.title,
    subjectName: topic.subject.name,
    blockCount: parsed.blocks.length,
  };
}

type ImportQuestion = {
  subjectCode: string;
  topicSlug?: string | null;
  examType: Prisma.QuestionCreateInput["examType"];
  examYear?: number | null;
  questionNumber?: number | null;
  questionText: string;
  questionImageUrl?: string | null;
  questionType: Prisma.QuestionCreateInput["questionType"];
  options?: Record<string, string> | null;
  correctAnswer: string;
  explanation: string;
  explanationImageUrl?: string | null;
  difficulty: Prisma.QuestionCreateInput["difficulty"];
  marks: number;
  timeEstimateSeconds: number;
};

export type QuestionImportResults = {
  imported: number;
  skipped: number;
  errors: Array<{ index: number; reason: string }>;
};

/** Bulk-imports questions, resolving subject codes and topic slugs in batch. */
export async function importQuestions(
  questions: ImportQuestion[],
  skipDuplicates: boolean,
): Promise<QuestionImportResults> {
  type SubjectRef = { id: string; code: string; name: string };
  type TopicRef = { id: string; subjectId: string };

  const subjectCodes = [
    ...new Set(questions.map((q) => q.subjectCode.toUpperCase())),
  ];
  const subjects = await db.subject.findMany({
    where: { code: { in: subjectCodes } },
    select: { id: true, code: true, name: true },
  });
  const subjectMap = new Map<string, SubjectRef>(
    subjects.map((s) => [s.code.toUpperCase(), s]),
  );

  const topicSlugs = [
    ...new Set(questions.filter((q) => q.topicSlug).map((q) => q.topicSlug!)),
  ];
  let topicMap = new Map<string, TopicRef>();
  if (topicSlugs.length > 0) {
    const topics = await db.topic.findMany({
      where: { slug: { in: topicSlugs } },
      select: { id: true, slug: true, subjectId: true },
    });
    topicMap = new Map<string, TopicRef>(
      topics.map((t) => [t.slug, { id: t.id, subjectId: t.subjectId }]),
    );
  }

  const results: QuestionImportResults = { imported: 0, skipped: 0, errors: [] };

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];

    const subject = subjectMap.get(q.subjectCode.toUpperCase());
    if (!subject) {
      results.errors.push({
        index: i,
        reason: `Unknown subject code: "${q.subjectCode}". Valid codes: ${subjectCodes.join(", ")}`,
      });
      continue;
    }

    let topicId: string | null = null;
    if (q.topicSlug) {
      const topic = topicMap.get(q.topicSlug);
      if (!topic) {
        results.errors.push({
          index: i,
          reason: `Unknown topic slug: "${q.topicSlug}" for subject "${subject.name}"`,
        });
        continue;
      }
      const ownership = checkTopicOwnership({
        topicRef: q.topicSlug,
        topicSubjectId: topic.subjectId,
        subjectId: subject.id,
      });
      if (ownership) {
        results.errors.push({
          index: i,
          reason: `Topic "${q.topicSlug}" does not belong to subject "${subject.name}"`,
        });
        continue;
      }
      topicId = topic.id;
    }

    // Same subject + examType + examYear + questionText counts as a duplicate.
    if (skipDuplicates) {
      const existing = await db.question.findFirst({
        where: {
          subjectId: subject.id,
          examType: q.examType,
          examYear: q.examYear || null,
          questionText: q.questionText,
        },
        select: { id: true },
      });
      if (existing) {
        results.skipped++;
        continue;
      }
    }

    try {
      await db.question.create({
        data: {
          subjectId: subject.id,
          topicId,
          examType: q.examType,
          examYear: q.examYear || null,
          questionNumber: q.questionNumber || null,
          questionText: q.questionText,
          questionImageUrl: q.questionImageUrl || null,
          questionType: q.questionType,
          // `options` is a nullable Json column, and Prisma requires the DbNull
          // sentinel to write SQL NULL there — a bare `null` is a type error.
          options: q.options || Prisma.DbNull,
          correctAnswer: q.correctAnswer,
          explanation: q.explanation,
          explanationImageUrl: q.explanationImageUrl || null,
          difficulty: q.difficulty,
          marks: q.marks,
          timeEstimateSeconds: q.timeEstimateSeconds,
        },
      });
      results.imported++;
    } catch (err) {
      results.errors.push({
        index: i,
        reason: `Database error: ${err instanceof Error ? err.message : "Unknown"}`,
      });
    }
  }

  return results;
}
