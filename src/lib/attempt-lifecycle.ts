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
 * The distinct topics a paper covers, for recording abandonment.
 *
 * One event per topic, not per question: a 40-question mock spanning 12 topics
 * means the student abandoned 12 topics once, not 40 times. Without the dedup
 * "started 3 times" would read as 120.
 */
export function distinctTopicRefs(
  questions: readonly { topicId: string | null; subjectId: string }[],
): Array<{ topicId: string; subjectId: string }> {
  const seen = new Map<string, string>();
  for (const question of questions) {
    if (!question.topicId) continue;
    if (!seen.has(question.topicId)) seen.set(question.topicId, question.subjectId);
  }
  return [...seen].map(([topicId, subjectId]) => ({ topicId, subjectId }));
}

/**
 * The minimal transaction surface `reapOneAttempt` needs. Deliberately
 * structural (not `Prisma.TransactionClient`) so it can be exercised in tests
 * with a plain fake, without a database.
 */
export type ReapTx = {
  assessmentAttempt: {
    updateMany: (args: {
      where: { id: string; status: "IN_PROGRESS" };
      data: { status: "TIMED_OUT" };
    }) => Promise<{ count: number }>;
  };
  learningEvent: {
    createMany: (args: {
      data: Array<{
        studentId: string;
        subjectId: string;
        topicId: string;
        kind: "QUIZ_ABANDONED";
        sourceId: string;
        occurredAt: Date;
      }>;
    }) => Promise<unknown>;
  };
};

/**
 * Transitions a single stale attempt and, only if this call is the one that
 * actually flipped it, emits its abandonment events.
 *
 * The `updateMany` is guarded by `status: "IN_PROGRESS"`, so of two overlapping
 * reaps racing on the same attempt, exactly one sees `count === 1` — the other
 * sees `count === 0` because the row is already `TIMED_OUT` and emits nothing.
 * That is the whole fix: the `createMany` that used to run unconditionally for
 * every reap now runs only for the reap that won the update.
 */
export async function reapOneAttempt(
  tx: ReapTx,
  studentId: string,
  attempt: {
    id: string;
    startedAt: Date;
    topicRefs: readonly { topicId: string; subjectId: string }[];
  },
): Promise<number> {
  const { count } = await tx.assessmentAttempt.updateMany({
    where: { id: attempt.id, status: "IN_PROGRESS" },
    data: { status: "TIMED_OUT" },
  });
  if (count !== 1) return 0;

  if (attempt.topicRefs.length > 0) {
    await tx.learningEvent.createMany({
      data: attempt.topicRefs.map((ref) => ({
        studentId,
        subjectId: ref.subjectId,
        topicId: ref.topicId,
        kind: "QUIZ_ABANDONED" as const,
        sourceId: attempt.id,
        occurredAt: attempt.startedAt,
      })),
    });
  }
  return count;
}

/**
 * Marks timed-out IN_PROGRESS attempts so they stop being resumable and stop
 * accumulating. Cheap enough to run opportunistically before generating.
 */
export async function reapStaleAttempts(studentId: string): Promise<number> {
  // Reaping is opportunistic housekeeping that runs before every quiz
  // generation. Nothing here is worth failing a student's quiz over, so any
  // failure — including from the initial query — is logged and reported as
  // zero reaped.
  try {
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

    // Second query, and only once something has actually expired: the first
    // query stays lightweight because it runs on every quiz generation and
    // usually finds nothing. Here `expired` is typically zero or one attempt.
    const expiredAttempts = await db.assessmentAttempt.findMany({
      where: { id: { in: expired } },
      select: {
        id: true,
        startedAt: true,
        assessment: {
          select: {
            questions: {
              select: { question: { select: { topicId: true, subjectId: true } } },
            },
          },
        },
      },
    });

    // Interactive transaction, one attempt at a time: a batch transaction
    // ran the updateMany and createMany as siblings, so two overlapping reaps
    // of the same attempt each satisfied their own updateMany's `id: { in }`
    // filter and both emitted a full event set — the updateMany's
    // `status: "IN_PROGRESS"` guard made the *status change* idempotent but
    // did nothing to guard the events. Per attempt, only the reap whose own
    // update reports `count === 1` (i.e. it actually flipped the row from
    // IN_PROGRESS) emits that attempt's events; a reap that loses the race
    // sees `count === 0` and emits nothing.
    //
    // `occurredAt` is the attempt's startedAt, not now: this reaper runs
    // opportunistically when the student next generates a quiz, so an attempt
    // abandoned on Monday may not be noticed until Thursday. The ledger records
    // when the student engaged, not when we found out.
    //
    // `expired` is typically zero or one attempt, so the loop is not a hot path.
    return await db.$transaction(async (tx) => {
      let reaped = 0;
      for (const attempt of expiredAttempts) {
        reaped += await reapOneAttempt(tx, studentId, {
          id: attempt.id,
          startedAt: attempt.startedAt,
          topicRefs: distinctTopicRefs(
            attempt.assessment.questions.map((aq) => aq.question),
          ),
        });
      }
      return reaped;
    });
  } catch (error) {
    console.error("Reaping stale attempts failed:", error);
    return 0;
  }
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
