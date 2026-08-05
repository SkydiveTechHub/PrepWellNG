import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  expandScopeRange,
  scopeOrdinal,
  type ScopePoint,
} from "@/lib/curriculum-scope";

// What the syllabus-scoped mock exam can actually offer.
//
// A question reaches a class and term through its topic's curriculum level, so
// anything untagged (`topicId IS NULL`) is invisible to this feature entirely.

export type ScopeCount = {
  classLevel: string;
  term: string;
  count: number;
};

export type SubjectAvailability = {
  id: string;
  code: string;
  name: string;
  /** Per class/term counts for the chosen exam board. */
  scopes: ScopeCount[];
  /** Total across the whole syllabus — 0 means nothing scoped for this board. */
  total: number;
};

/**
 * Subjects offerable for an exam board, each with a per-slot question count.
 *
 * One grouped query rather than a count per subject per slot: nine slots across
 * forty-odd subjects would otherwise be hundreds of round-trips.
 */
export async function getMockExamAvailability(
  examType: string,
): Promise<SubjectAvailability[]> {
  const rows = await db.$queryRaw<
    {
      subjectId: string;
      code: string;
      name: string;
      classLevel: string;
      term: string;
      n: number;
    }[]
  >`
    SELECT s.id             AS "subjectId",
           s.code           AS code,
           s.name           AS name,
           cl."classLevel"  AS "classLevel",
           cl.term          AS term,
           COUNT(*)::int    AS n
    FROM "Question" q
    JOIN "Topic" t            ON t.id  = q."topicId"
    JOIN "CurriculumLevel" cl ON cl.id = t."curriculumLevelId"
    JOIN "Subject" s          ON s.id  = q."subjectId"
    WHERE q."examType" = ${examType}::"ExamType"
      AND q."questionType" = 'OBJECTIVE'::"QuestionType"
    GROUP BY s.id, s.code, s.name, cl."classLevel", cl.term
  `;

  const bySubject = new Map<string, SubjectAvailability>();
  for (const row of rows) {
    const entry = bySubject.get(row.subjectId) ?? {
      id: row.subjectId,
      code: row.code,
      name: row.name,
      scopes: [],
      total: 0,
    };
    entry.scopes.push({
      classLevel: row.classLevel,
      term: row.term,
      count: row.n,
    });
    entry.total += row.n;
    bySubject.set(row.subjectId, entry);
  }

  for (const entry of bySubject.values()) {
    entry.scopes.sort(
      (a, b) =>
        scopeOrdinal(a as ScopePoint) - scopeOrdinal(b as ScopePoint),
    );
  }

  return [...bySubject.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Questions available for one subject across a scope range. */
export async function countForRange({
  subjectId,
  examType,
  from,
  to,
}: {
  subjectId: string;
  examType: string;
  from: ScopePoint;
  to: ScopePoint;
}): Promise<number> {
  const scopes = expandScopeRange(from, to);
  const slots = scopes.map(
    (scope) =>
      Prisma.sql`(cl."classLevel" = ${scope.classLevel}::"ClassLevel" AND cl.term = ${scope.term}::"Term")`,
  );

  const rows = await db.$queryRaw<{ n: number }[]>`
    SELECT COUNT(*)::int AS n
    FROM "Question" q
    JOIN "Topic" t            ON t.id  = q."topicId"
    JOIN "CurriculumLevel" cl ON cl.id = t."curriculumLevelId"
    WHERE q."subjectId" = ${subjectId}
      AND q."examType" = ${examType}::"ExamType"
      AND q."questionType" = 'OBJECTIVE'::"QuestionType"
      AND (${Prisma.join(slots, " OR ")})
  `;
  return rows[0]?.n ?? 0;
}
