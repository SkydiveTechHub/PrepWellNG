import { Prisma } from "@prisma/client";
import { db } from "./db";
import {
  checkQuestionInvariants,
  checkTopicOwnership,
  normalizeOptions,
} from "./admin-question";

/**
 * Admin question CRUD. Cache revalidation and audit logging stay with the route
 * handlers — this module only touches the database.
 */

export type AdminQuestionFilter = {
  subjectId?: string | null;
  examType?: string | null;
  examYear?: string | null;
  difficulty?: string | null;
  search?: string | null;
};

/** One page of the admin question list, with its pagination envelope. */
export async function listAdminQuestions(
  filter: AdminQuestionFilter,
  page: number,
  pageSize: number,
) {
  const where: Record<string, unknown> = {};
  if (filter.subjectId) where.subjectId = filter.subjectId;
  if (filter.examType) where.examType = filter.examType;
  if (filter.examYear) where.examYear = parseInt(filter.examYear);
  if (filter.difficulty) where.difficulty = filter.difficulty;
  if (filter.search) {
    where.questionText = { contains: filter.search, mode: "insensitive" };
  }

  const [questions, total] = await Promise.all([
    db.question.findMany({
      where,
      include: {
        subject: { select: { name: true, code: true } },
        topic: { select: { title: true, slug: true } },
      },
      orderBy: [
        { examType: "asc" },
        { examYear: "desc" },
        { questionNumber: "asc" },
      ],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.question.count({ where }),
  ]);

  return {
    questions,
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  };
}

/** A single question with its subject and topic, for the edit form. */
export async function getAdminQuestion(id: string) {
  return db.question.findUnique({
    where: { id },
    include: {
      subject: { select: { id: true, name: true, code: true } },
      topic: { select: { id: true, title: true } },
    },
  });
}

type QuestionWriteInput = {
  subjectId: string;
  topicId?: string | null;
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

/**
 * Creates a question after checking the subject exists and the topic hangs off
 * it — the foreign key alone permits any topic in the database.
 */
export async function createAdminQuestion(input: QuestionWriteInput) {
  const subject = await db.subject.findUnique({
    where: { id: input.subjectId },
    select: { id: true, code: true },
  });
  if (!subject) return { outcome: "unknown-subject" as const };

  const topic = input.topicId
    ? await db.topic.findUnique({
        where: { id: input.topicId },
        select: { id: true, subjectId: true },
      })
    : null;
  const ownership = checkTopicOwnership({
    topicRef: input.topicId ?? null,
    topicSubjectId: topic?.subjectId ?? null,
    subjectId: input.subjectId,
  });
  if (ownership) return { outcome: "bad-topic" as const, ownership };

  const { options } = normalizeOptions(input.options);

  const created = await db.question.create({
    data: {
      subjectId: input.subjectId,
      topicId: input.topicId ?? null,
      examType: input.examType,
      examYear: input.examYear ?? null,
      questionNumber: input.questionNumber ?? null,
      questionText: input.questionText,
      questionImageUrl: input.questionImageUrl ?? null,
      questionType: input.questionType,
      // A bare null is a type error on a nullable Json column; Prisma needs the
      // DbNull sentinel.
      options: options ?? Prisma.DbNull,
      correctAnswer: input.correctAnswer.trim().toUpperCase(),
      explanation: input.explanation,
      explanationImageUrl: input.explanationImageUrl ?? null,
      difficulty: input.difficulty,
      marks: input.marks,
      timeEstimateSeconds: input.timeEstimateSeconds,
    },
    select: { id: true },
  });

  return { outcome: "ok" as const, id: created.id, subjectCode: subject.code };
}

/**
 * Partial update.
 *
 * The invariants are checked against the record MERGED with the patch, not the
 * patch alone — a patch that rewrites `options` without resending
 * `correctAnswer` would otherwise pass validation and leave a question whose
 * correct answer is no longer one of its options.
 */
export async function updateAdminQuestion(
  id: string,
  patch: Partial<QuestionWriteInput>,
) {
  const existing = await db.question.findUnique({
    where: { id },
    select: {
      id: true,
      subjectId: true,
      topicId: true,
      questionType: true,
      options: true,
      correctAnswer: true,
    },
  });
  if (!existing) return { outcome: "not-found" as const };

  // Merge before checking: the patch is partial, the invariants are not.
  const mergedType = patch.questionType ?? existing.questionType;
  const mergedOptions =
    patch.options !== undefined
      ? (patch.options ?? null)
      : ((existing.options as Record<string, string> | null) ?? null);
  const mergedAnswer = patch.correctAnswer ?? existing.correctAnswer;
  const mergedSubjectId = patch.subjectId ?? existing.subjectId;
  const mergedTopicId =
    patch.topicId !== undefined ? (patch.topicId ?? null) : existing.topicId;

  const issues = checkQuestionInvariants({
    questionType: mergedType,
    options: mergedOptions,
    correctAnswer: mergedAnswer,
  });
  if (issues.length > 0) return { outcome: "invalid" as const, issues };

  // Only re-check ownership when either side of the pair moved.
  if (patch.subjectId !== undefined || patch.topicId !== undefined) {
    const topic = mergedTopicId
      ? await db.topic.findUnique({
          where: { id: mergedTopicId },
          select: { subjectId: true },
        })
      : null;
    const ownership = checkTopicOwnership({
      topicRef: mergedTopicId,
      topicSubjectId: topic?.subjectId ?? null,
      subjectId: mergedSubjectId,
    });
    if (ownership) return { outcome: "bad-topic" as const, ownership };
  }

  const { options: normalizedOptions } = normalizeOptions(mergedOptions);

  await db.question.update({
    where: { id },
    data: {
      ...patch,
      // Nulls on these two columns need explicit handling rather than the
      // spread's undefined-vs-null ambiguity.
      options:
        patch.options !== undefined
          ? (normalizedOptions ?? Prisma.DbNull)
          : undefined,
      correctAnswer:
        patch.correctAnswer !== undefined
          ? patch.correctAnswer.trim().toUpperCase()
          : undefined,
    },
  });

  return { outcome: "ok" as const, id };
}

/**
 * Deletes questions that have no dependents.
 *
 * Dependents (question responses and assessment slots) are counted first and
 * refused explicitly rather than left to surface as an opaque FK-restrict 500.
 */
export async function deleteAdminQuestions(ids: string[]) {
  // Resolve which requested ids genuinely exist BEFORE partitioning. An id that
  // does not exist at all produces zero rows in both dependent groupBys below,
  // which is indistinguishable from "exists with no dependents" unless
  // existence is checked separately — without this, a non-existent id would
  // silently land in `deletable`, match nothing in `deleteMany`, and still be
  // reported as deleted.
  const existing = await db.question.findMany({
    where: { id: { in: ids } },
    select: { id: true },
  });
  const existingIds = new Set(existing.map((q) => q.id));
  const notFound = ids.filter((id) => !existingIds.has(id));
  const existingRequestedIds = ids.filter((id) => existingIds.has(id));

  // Count dependents in two grouped queries rather than one per id.
  const [responses, assessments] = await Promise.all([
    db.questionResponse.groupBy({
      by: ["questionId"],
      where: { questionId: { in: existingRequestedIds } },
      _count: { questionId: true },
    }),
    db.assessmentQuestion.groupBy({
      by: ["questionId"],
      where: { questionId: { in: existingRequestedIds } },
      _count: { questionId: true },
    }),
  ]);

  const responseCounts = new Map(
    responses.map((r) => [r.questionId, r._count.questionId]),
  );
  const assessmentCounts = new Map(
    assessments.map((r) => [r.questionId, r._count.questionId]),
  );

  const refused = existingRequestedIds
    .map((id) => ({
      id,
      responseCount: responseCounts.get(id) ?? 0,
      assessmentCount: assessmentCounts.get(id) ?? 0,
    }))
    .filter((row) => row.responseCount > 0 || row.assessmentCount > 0);

  const refusedIds = new Set(refused.map((r) => r.id));
  const deletable = existingRequestedIds.filter((id) => !refusedIds.has(id));

  if (deletable.length > 0) {
    await db.question.deleteMany({ where: { id: { in: deletable } } });
  }

  return { deleted: deletable, refused, notFound };
}
