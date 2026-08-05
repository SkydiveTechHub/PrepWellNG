import { db } from "@/lib/db";
import { deadlineFor, isAttemptStale } from "@/lib/attempt-timing";

// Attempt reuse and cleanup.
//
// Every generate call used to create a fresh Assessment plus a row per
// question, and every abandoned quiz left an IN_PROGRESS attempt behind
// forever. Reloading a mock exam silently built a whole new 45-question paper.

export type ResumableAttempt = {
  attemptId: string;
  assessmentId: string;
  title: string;
  timeLimitMinutes: number | null;
  deadlineAt: Date | null;
  examYear: number | null;
  questions: {
    orderIndex: number;
    question: {
      id: string;
      subjectId: string;
      topicId: string | null;
      questionText: string;
      questionImageUrl: string | null;
      questionType: string;
      options: unknown;
      difficulty: string;
      marks: number;
      examType: string;
      examYear: number | null;
    };
  }[];
};

/**
 * Marks timed-out IN_PROGRESS attempts so they stop being resumable and stop
 * accumulating. Cheap enough to run opportunistically before generating.
 */
export async function reapStaleAttempts(studentId: string): Promise<number> {
  const stale = await db.assessmentAttempt.findMany({
    where: { studentId, status: "IN_PROGRESS" },
    select: {
      id: true,
      startedAt: true,
      assessment: { select: { timeLimitMinutes: true } },
    },
    take: 100,
  });

  const now = new Date();
  const expired = stale
    .filter((attempt) =>
      isAttemptStale({
        startedAt: attempt.startedAt,
        timeLimitMinutes: attempt.assessment.timeLimitMinutes,
        now,
      }),
    )
    .map((attempt) => attempt.id);

  if (expired.length === 0) return 0;

  const result = await db.assessmentAttempt.updateMany({
    where: { id: { in: expired }, status: "IN_PROGRESS" },
    data: { status: "TIMED_OUT" },
  });
  return result.count;
}

/**
 * An unexpired IN_PROGRESS attempt matching the same quiz configuration, or
 * null. Matching is by subject, type, exam and length — the fields that make
 * two generated papers interchangeable from the student's point of view.
 */
export async function findResumableAttempt({
  studentId,
  subjectId,
  assessmentType,
  examType,
  totalMarks,
  topicIds,
  examYear,
}: {
  studentId: string;
  subjectId?: string | null;
  assessmentType: string;
  examType?: string | null;
  totalMarks?: number;
  /** For past-paper style assessments, the sitting must match too. */
  examYear?: number | null;
  /**
   * Restricts resuming to papers actually drawn from these topics.
   *
   * `Assessment` records no topic, so without this an abandoned Topic A quiz
   * would be handed back to a student who just asked for Topic B — same
   * subject, same type, same length.
   */
  topicIds?: readonly string[];
}): Promise<ResumableAttempt | null> {
  const candidates = await db.assessmentAttempt.findMany({
    where: {
      studentId,
      status: "IN_PROGRESS",
      assessment: {
        assessmentType: assessmentType as never,
        ...(subjectId ? { subjectId } : {}),
        ...(examType ? { examType: examType as never } : {}),
        ...(totalMarks != null ? { totalMarks } : {}),
        ...(examYear != null ? { examYear } : {}),
      },
    },
    orderBy: { startedAt: "desc" },
    take: 5,
    select: {
      id: true,
      startedAt: true,
      assessment: {
        select: {
          id: true,
          title: true,
          timeLimitMinutes: true,
          examYear: true,
          questions: {
            orderBy: { orderIndex: "asc" },
            select: {
              orderIndex: true,
              question: {
                select: {
                  id: true,
                  subjectId: true,
                  topicId: true,
                  questionText: true,
                  questionImageUrl: true,
                  questionType: true,
                  options: true,
                  difficulty: true,
                  marks: true,
                  examType: true,
                  examYear: true,
                },
              },
            },
          },
        },
      },
    },
  });

  const now = new Date();
  for (const candidate of candidates) {
    // An untimed attempt stays resumable for a fallback window; a timed one
    // only while it has time (plus the submit grace period).
    if (
      isAttemptStale({
        startedAt: candidate.startedAt,
        timeLimitMinutes: candidate.assessment.timeLimitMinutes,
        now,
      })
    ) {
      continue;
    }
    if (candidate.assessment.questions.length === 0) continue;

    // Same subject and length is not the same quiz. Only resume a paper whose
    // questions actually came from the topics being asked for.
    if (topicIds && topicIds.length > 0) {
      const wanted = new Set(topicIds);
      const matchesTopic = candidate.assessment.questions.every(
        ({ question }) => question.topicId && wanted.has(question.topicId),
      );
      if (!matchesTopic) continue;
    }

    return {
      attemptId: candidate.id,
      assessmentId: candidate.assessment.id,
      title: candidate.assessment.title,
      timeLimitMinutes: candidate.assessment.timeLimitMinutes,
      deadlineAt: deadlineFor(
        candidate.startedAt,
        candidate.assessment.timeLimitMinutes,
      ),
      examYear: candidate.assessment.examYear,
      questions: candidate.assessment.questions,
    };
  }

  return null;
}
