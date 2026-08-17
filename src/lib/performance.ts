import { db } from "./db";

/** A completed attempt as the performance page lists it. Dates are ISO strings. */
export type PerformanceAttempt = {
  id: string;
  title: string;
  subjectName: string | null;
  percentage: number | null;
  score: number | null;
  totalMarks: number | null;
  completedAt: string | null;
};

/** Per-subject accuracy, flattened out of the PerformanceMetric relation. */
export type PerformanceSubjectMetric = {
  subjectName: string;
  subjectSlug: string;
  subjectCode: string;
  totalAttempted: number;
  totalCorrect: number;
  accuracy: number;
};

export type PerformanceWeakTopic = {
  title: string;
  slug: string;
  wrongCount: number;
};

export type PerformanceSubjectWeakTopics = {
  subject: { id: string; name: string; slug: string; code: string };
  topics: PerformanceWeakTopic[];
};

export type PerformanceData = {
  attempts: PerformanceAttempt[];
  subjectMetrics: PerformanceSubjectMetric[];
  subjectWeakTopics: PerformanceSubjectWeakTopics[];
};

/** WAEC-style grade boundaries. Domain rule, not presentation. */
export function getGrade(percentage: number): string {
  if (percentage >= 75) return "A";
  if (percentage >= 65) return "B";
  if (percentage >= 50) return "C";
  if (percentage >= 40) return "D";
  return "F";
}

/** The worst five topics per subject, aggregated in the database. */
async function loadWeakTopics(userId: string): Promise<PerformanceSubjectWeakTopics[]> {
  // This used to pull every wrong response the student had ever given — two
  // joins, no bound — and count them in JS. The grouped form returns one row
  // per (subject, topic) instead.
  const weakRows = await db.$queryRaw<
    {
      subjectId: string;
      subjectName: string;
      subjectSlug: string;
      subjectCode: string;
      topicTitle: string;
      topicSlug: string;
      wrongCount: number;
    }[]
  >`
    SELECT s.id            AS "subjectId",
           s.name          AS "subjectName",
           s.slug          AS "subjectSlug",
           s.code          AS "subjectCode",
           t.title         AS "topicTitle",
           t.slug          AS "topicSlug",
           COUNT(*)::int   AS "wrongCount"
    FROM "QuestionResponse" qr
    JOIN "AssessmentAttempt" aa ON aa.id = qr."attemptId"
    JOIN "Question" q          ON q.id  = qr."questionId"
    JOIN "Subject" s           ON s.id  = q."subjectId"
    JOIN "Topic" t             ON t.id  = q."topicId"
    WHERE aa."studentId" = ${userId}
      AND qr."isCorrect" = false
    GROUP BY s.id, s.name, s.slug, s.code, t.id, t.title, t.slug
    ORDER BY "wrongCount" DESC
  `;

  const weakBySubject = new Map<string, PerformanceSubjectWeakTopics>();

  // Rows arrive sorted by wrongCount, so the first five per subject are the worst five.
  for (const row of weakRows) {
    let entry = weakBySubject.get(row.subjectId);
    if (!entry) {
      entry = {
        subject: {
          id: row.subjectId,
          name: row.subjectName,
          slug: row.subjectSlug,
          code: row.subjectCode,
        },
        topics: [],
      };
      weakBySubject.set(row.subjectId, entry);
    }
    if (entry.topics.length < 5) {
      entry.topics.push({
        title: row.topicTitle,
        slug: row.topicSlug,
        wrongCount: row.wrongCount,
      });
    }
  }

  return [...weakBySubject.values()].filter((entry) => entry.topics.length > 0);
}

export async function getPerformanceData(userId: string): Promise<PerformanceData> {
  const attemptsQuery = db.assessmentAttempt.findMany({
    where: { studentId: userId, status: "COMPLETED" },
    orderBy: { completedAt: "desc" },
    take: 20,
    select: {
      id: true,
      percentage: true,
      score: true,
      totalMarks: true,
      completedAt: true,
      assessment: {
        select: {
          title: true,
          subject: { select: { name: true, slug: true } },
        },
      },
    },
  });
  const attemptedQuery = db.learningEvent.groupBy({
    by: ["subjectId"],
    where: { studentId: userId, kind: "QUESTION_ANSWERED" },
    _count: { _all: true },
  });
  const correctQuery = db.learningEvent.groupBy({
    by: ["subjectId"],
    where: { studentId: userId, kind: "QUESTION_ANSWERED", correct: true },
    _count: { _all: true },
  });

  const [attempts, attemptedRows, correctRows] = await db.$transaction([
    attemptsQuery,
    attemptedQuery,
    correctQuery,
  ]);

  const correctBySubject = new Map(
    correctRows.map((row) => [row.subjectId, row._count._all]),
  );
  const subjectIds = attemptedRows.map((row) => row.subjectId);
  const subjects = await db.subject.findMany({
    where: { id: { in: subjectIds } },
    select: { id: true, name: true, slug: true, code: true },
  });
  const subjectById = new Map(subjects.map((s) => [s.id, s]));

  const subjectMetrics = attemptedRows
    .flatMap((row) => {
      const subject = subjectById.get(row.subjectId);
      if (!subject) return [];
      const totalAttempted = row._count._all;
      const totalCorrect = correctBySubject.get(row.subjectId) ?? 0;
      return [{
        subjectName: subject.name,
        subjectSlug: subject.slug,
        subjectCode: subject.code,
        totalAttempted,
        totalCorrect,
        accuracy: totalAttempted > 0 ? (totalCorrect / totalAttempted) * 100 : 0,
      }];
    })
    .sort((a, b) => b.accuracy - a.accuracy);

  return {
    attempts: attempts.map((a) => ({
      id: a.id,
      title: a.assessment.title,
      subjectName: a.assessment.subject?.name ?? null,
      percentage: a.percentage,
      score: a.score,
      totalMarks: a.totalMarks,
      completedAt: a.completedAt?.toISOString() ?? null,
    })),
    subjectMetrics,
    subjectWeakTopics: await loadWeakTopics(userId),
  };
}
