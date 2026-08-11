import { db } from "./db";
import { getGrade } from "./utils";
import { buildAttemptResult } from "./attempt-results";
import { evaluateAttemptTiming } from "./attempt-timing";
import { scoreJambPaper } from "./jamb-cbt";
import { emitLearningEvents, type NewLearningEvent } from "./learning-events";

export type SubmittedAnswer = {
  questionId: string;
  selectedAnswer?: string | null;
  timeSpentSeconds?: number | null;
  flaggedForReview?: boolean | null;
};

type AttemptResult = NonNullable<Awaited<ReturnType<typeof buildAttemptResult>>>;

/**
 * `graded` means this call did the marking, and is the only case where
 * achievements should be re-checked. `replayed` means an already-completed
 * attempt was returned as-is.
 */
export type SubmitAttemptResult =
  | { outcome: "not-found" }
  | { outcome: "expired" }
  | { outcome: "graded"; result: AttemptResult }
  | { outcome: "replayed"; result: AttemptResult };

async function replay(
  attemptId: string,
  studentId: string,
): Promise<SubmitAttemptResult> {
  const existing = await buildAttemptResult(attemptId, studentId);
  return existing ? { outcome: "replayed", result: existing } : { outcome: "not-found" };
}

/**
 * Grades an attempt and returns the result.
 *
 * Idempotent: submitting an already-completed attempt replays the stored result
 * instead of failing. A student who double-taps Submit, or retries after a
 * flaky connection, must never be told their work was lost.
 */
export async function submitAttempt(
  studentId: string,
  attemptId: string,
  answers: SubmittedAnswer[],
): Promise<SubmitAttemptResult> {
  const attempt = await db.assessmentAttempt.findFirst({
    where: { id: attemptId, studentId },
    select: {
      id: true,
      status: true,
      startedAt: true,
      assessment: {
        select: {
          timeLimitMinutes: true,
          assessmentType: true,
          questions: {
            select: {
              question: {
                select: {
                  id: true,
                  correctAnswer: true,
                  marks: true,
                  topicId: true,
                  subjectId: true,
                  difficulty: true,
                  subject: { select: { code: true, name: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!attempt) return { outcome: "not-found" };
  if (attempt.status === "COMPLETED") return replay(attemptId, studentId);

  const questionMap = new Map(
    attempt.assessment.questions.map((aq) => [aq.question.id, aq.question]),
  );

  let markedCorrect = 0;
  let markedTotal = 0;
  const responseData: {
    attemptId: string;
    questionId: string;
    selectedAnswer: string | null;
    isCorrect: boolean;
    timeSpentSeconds: number | null;
    flaggedForReview: boolean;
  }[] = [];
  const learningEvents: NewLearningEvent[] = [];
  const graded: {
    subjectId: string;
    subjectCode: string;
    subjectName: string;
    isCorrect: boolean;
  }[] = [];

  for (const answer of answers) {
    const question = questionMap.get(answer.questionId);
    if (!question) continue;

    const isCorrect = answer.selectedAnswer === question.correctAnswer;
    if (isCorrect) markedCorrect += question.marks;
    markedTotal += question.marks;

    graded.push({
      subjectId: question.subjectId,
      subjectCode: question.subject?.code ?? "",
      subjectName: question.subject?.name ?? "Unknown",
      isCorrect,
    });

    responseData.push({
      attemptId,
      questionId: answer.questionId,
      selectedAnswer: answer.selectedAnswer || null,
      isCorrect,
      timeSpentSeconds: answer.timeSpentSeconds || null,
      flaggedForReview: answer.flaggedForReview || false,
    });

    learningEvents.push({
      studentId,
      subjectId: question.subjectId,
      topicId: question.topicId,
      kind: "QUESTION_ANSWERED",
      correct: isCorrect,
      difficulty: question.difficulty,
      seconds: answer.timeSpentSeconds || null,
      sourceId: question.id,
    });
  }

  // A JAMB CBT paper is marked out of 400 with every subject worth 100,
  // regardless of question count — an English question is worth 100/60 while a
  // Biology one in the same paper is worth 100/40. Summing question marks would
  // instead weight English at 60/180 of the paper.
  const isJambCbt = attempt.assessment.assessmentType === "CBT_PRACTICE";
  const jamb = isJambCbt ? scoreJambPaper(graded) : null;

  const totalCorrect = jamb ? jamb.score : markedCorrect;
  const totalMarks = jamb ? jamb.totalMarks : markedTotal;
  const percentage = jamb
    ? jamb.percentage
    : markedTotal > 0
      ? (markedCorrect / markedTotal) * 100
      : 0;
  const gradeInfo = getGrade(percentage);

  // Client-reported time is advisory. The recorded figure is clamped to the
  // elapsed wall time since `startedAt` and to the assessment's own limit, so
  // neither a doctored payload nor a tab left open overnight can inflate it.
  const timing = evaluateAttemptTiming({
    startedAt: attempt.startedAt,
    timeLimitMinutes: attempt.assessment.timeLimitMinutes,
    reportedSeconds: answers.reduce((sum, a) => sum + (a.timeSpentSeconds || 0), 0),
    now: new Date(),
  });

  if (timing.exceededLimit) {
    // Still graded — losing a student's work to a slow clock is worse than a
    // soft overrun — but recorded honestly rather than silently accepted.
    console.warn(
      `Attempt ${attemptId} submitted ${timing.elapsedSeconds}s after start, limit ${timing.allowedSeconds}s`,
    );
  }

  // Claim the attempt and write the responses atomically. The status check
  // lives *inside* the transaction as a compare-and-set: two concurrent
  // submissions race here, exactly one wins, and the loser replays the winner's
  // result rather than colliding on the response unique index.
  const won = await db.$transaction(async (tx) => {
    const claim = await tx.assessmentAttempt.updateMany({
      where: { id: attemptId, studentId, status: "IN_PROGRESS" },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        score: totalCorrect,
        totalMarks,
        percentage,
        grade: gradeInfo.grade,
        timeSpentSeconds: timing.timeSpentSeconds,
      },
    });

    if (claim.count === 0) return false;

    await tx.questionResponse.createMany({
      data: responseData,
      skipDuplicates: true,
    });

    // In-transaction: the ledger row and the response it describes commit
    // together or not at all. The compare-and-set above means only the winning
    // submission reaches here, so a double-tap cannot double-count.
    await emitLearningEvents(tx, learningEvents);
    return true;
  });

  if (!won) {
    // The compare-and-set lost: the attempt was no longer IN_PROGRESS by the
    // time we tried to claim it. Two things can cause that. (1) A concurrent
    // submission — two tabs, or the timer's auto-submit racing a manual tap —
    // both read IN_PROGRESS before this transaction, and the other one won: it
    // just committed COMPLETED, so we re-read and replay its result rather than
    // telling the student their graded work vanished. (2) The attempt was
    // genuinely reaped (TIMED_OUT/ABANDONED) while it was open; the answers were
    // never recorded, and returning 200 with an empty result would show the
    // student a fake 0% instead of telling them their window closed.
    const current = await db.assessmentAttempt.findFirst({
      where: { id: attemptId, studentId },
      select: { status: true },
    });

    if (current?.status === "COMPLETED") return replay(attemptId, studentId);
    return { outcome: "expired" };
  }

  const result = await buildAttemptResult(attemptId, studentId);
  if (!result) return { outcome: "not-found" };

  return { outcome: "graded", result };
}
