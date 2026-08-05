import { Prisma, type PrismaClient } from "@prisma/client";

// Random question selection happens in the database.
//
// Both generators used to `findMany({ select: { id: true } })` over every
// matching question and Fisher-Yates the result in Node. On a real past-paper
// bank that ships the entire id set over the wire on every quiz start — and the
// mock-exam generator did it once per subject, in a loop.

export type QuestionPoolFilter = {
  subjectId: string;
  topicIds?: readonly string[];
  examType?: string;
  difficulty?: string;
  /**
   * Skip questions this student already answered recently, so repeat practice
   * surfaces new material instead of the same handful of items.
   */
  excludeSeenByStudentId?: string;
  /** How far back "recently" reaches. Ignored without a student id. */
  seenWithinDays?: number;
  /**
   * Restrict to topics taught in these syllabus slots.
   *
   * Questions reach a class and term through their topic's curriculum level, so
   * an untagged question (`topicId IS NULL`) can never satisfy a scope filter —
   * it is silently outside every slot rather than wrongly included.
   */
  scopes?: readonly { classLevel: string; term: string }[];
};

/** Default recency window for {@link QuestionPoolFilter.seenWithinDays}. */
export const DEFAULT_SEEN_WINDOW_DAYS = 30;

function buildConditions(filter: QuestionPoolFilter): Prisma.Sql[] {
  const conditions: Prisma.Sql[] = [
    Prisma.sql`q."subjectId" = ${filter.subjectId}`,
    Prisma.sql`q."questionType" = 'OBJECTIVE'::"QuestionType"`,
  ];
  if (filter.topicIds && filter.topicIds.length > 0) {
    conditions.push(
      Prisma.sql`q."topicId" IN (${Prisma.join([...filter.topicIds])})`,
    );
  }
  if (filter.examType) {
    conditions.push(Prisma.sql`q."examType" = ${filter.examType}::"ExamType"`);
  }
  if (filter.difficulty) {
    conditions.push(
      Prisma.sql`q."difficulty" = ${filter.difficulty}::"Difficulty"`,
    );
  }
  if (filter.scopes && filter.scopes.length > 0) {
    const slots = filter.scopes.map(
      (scope) =>
        Prisma.sql`(cl."classLevel" = ${scope.classLevel}::"ClassLevel" AND cl.term = ${scope.term}::"Term")`,
    );
    conditions.push(Prisma.sql`
      EXISTS (
        SELECT 1
        FROM "Topic" t
        JOIN "CurriculumLevel" cl ON cl.id = t."curriculumLevelId"
        WHERE t.id = q."topicId"
          AND (${Prisma.join(slots, " OR ")})
      )
    `);
  }
  if (filter.excludeSeenByStudentId) {
    // QuestionResponse carries no timestamp of its own, so recency is measured
    // from the attempt it belongs to.
    const cutoff = new Date(
      Date.now() -
        (filter.seenWithinDays ?? DEFAULT_SEEN_WINDOW_DAYS) * 86_400_000,
    );
    conditions.push(Prisma.sql`
      NOT EXISTS (
        SELECT 1
        FROM "QuestionResponse" qr
        JOIN "AssessmentAttempt" aa ON aa.id = qr."attemptId"
        WHERE qr."questionId" = q.id
          AND aa."studentId" = ${filter.excludeSeenByStudentId}
          AND aa."completedAt" IS NOT NULL
          AND aa."completedAt" >= ${cutoff}
      )
    `);
  }
  return conditions;
}

/**
 * Up to `count` random question ids matching the filter. Returns fewer (or an
 * empty array) when the pool is smaller than requested — callers decide whether
 * that is an error or a reason to widen the filter.
 */
export async function pickRandomQuestionIds(
  db: Pick<PrismaClient, "$queryRaw">,
  filter: QuestionPoolFilter,
  count: number,
): Promise<string[]> {
  if (count <= 0) return [];
  const where = Prisma.join(buildConditions(filter), " AND ");
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT q.id
    FROM "Question" q
    WHERE ${where}
    ORDER BY random()
    LIMIT ${count}
  `;
  return rows.map((row) => row.id);
}

/** How many questions match a filter, for showing availability before starting. */
export async function countQuestionsMatching(
  db: Pick<PrismaClient, "$queryRaw">,
  filter: QuestionPoolFilter,
): Promise<number> {
  const where = Prisma.join(buildConditions(filter), " AND ");
  const rows = await db.$queryRaw<{ n: number }[]>`
    SELECT COUNT(*)::int AS n FROM "Question" q WHERE ${where}
  `;
  return rows[0]?.n ?? 0;
}

/**
 * Prefers unseen questions but always returns a full-length quiz when the bank
 * allows it.
 *
 * A diligent student eventually exhausts the unseen pool for a topic; without
 * the top-up they would silently start getting shorter and shorter quizzes.
 */
export async function pickQuestionsPreferringUnseen(
  db: Pick<PrismaClient, "$queryRaw">,
  filter: QuestionPoolFilter,
  count: number,
  studentId: string,
): Promise<string[]> {
  if (count <= 0) return [];

  const unseen = await pickRandomQuestionIds(
    db,
    { ...filter, excludeSeenByStudentId: studentId },
    count,
  );
  if (unseen.length >= count) return unseen;

  // Top up from the full pool, skipping what we already picked.
  const shortfall = count - unseen.length;
  const chosen = new Set(unseen);
  const filler = await pickRandomQuestionIds(
    db,
    filter,
    count + shortfall, // over-fetch so duplicates can be dropped
  );

  for (const id of filler) {
    if (chosen.size >= count) break;
    chosen.add(id);
  }
  return [...chosen].slice(0, count);
}
