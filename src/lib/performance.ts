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

export type PerformanceData = {
  attempts: PerformanceAttempt[];
  subjectMetrics: PerformanceSubjectMetric[];
};

/** WAEC-style grade boundaries. Domain rule, not presentation. */
export function getGrade(percentage: number): string {
  if (percentage >= 75) return "A";
  if (percentage >= 65) return "B";
  if (percentage >= 50) return "C";
  if (percentage >= 40) return "D";
  return "F";
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
  };
}
