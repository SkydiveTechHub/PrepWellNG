import { NextRequest, NextResponse, after } from "next/server";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { submitAssessmentSchema } from "@/lib/validators";
import { getGrade } from "@/lib/utils";
import { buildAttemptResult } from "@/lib/attempt-results";
import { awardAchievements } from "@/lib/achievements";
import { evaluateAttemptTiming } from "@/lib/attempt-timing";
import { scoreJambPaper } from "@/lib/jamb-cbt";

export const dynamic = "force-dynamic";

// POST /api/assessments/submit — grade an attempt and return the results.
//
// Idempotent: submitting an already-completed attempt replays the stored result
// instead of failing. A student who double-taps Submit, or retries after a
// flaky connection, must never be told their work was lost.
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const studentId = session.user.id;

    const body = await req.json();
    const parsed = submitAssessmentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { attemptId, answers } = parsed.data;

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
                    subject: { select: { code: true, name: true } },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!attempt) {
      return NextResponse.json(
        { error: "Assessment attempt not found." },
        { status: 404 },
      );
    }

    if (attempt.status === "COMPLETED") {
      const existing = await buildAttemptResult(attemptId, studentId);
      if (existing) return NextResponse.json(existing);
      return NextResponse.json(
        { error: "Assessment attempt not found." },
        { status: 404 },
      );
    }

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
    }

    // A JAMB CBT paper is marked out of 400 with every subject worth 100,
    // regardless of question count — an English question is worth 100/60 while
    // a Biology one in the same paper is worth 100/40. Summing question marks
    // would instead weight English at 60/180 of the paper.
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
      reportedSeconds: answers.reduce(
        (sum, a) => sum + (a.timeSpentSeconds || 0),
        0,
      ),
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
    // submissions race here, exactly one wins, and the loser replays the
    // winner's result rather than colliding on the response unique index.
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
      return true;
    });

    const result = await buildAttemptResult(attemptId, studentId);
    if (!result) {
      return NextResponse.json(
        { error: "Assessment attempt not found." },
        { status: 404 },
      );
    }

    // `after()` keeps the work inside the request lifetime. Fire-and-forget
    // promises are dropped when a serverless function freezes on response, so
    // achievements silently stopped being awarded in production.
    if (won) {
      after(async () => {
        try {
          await awardAchievements(studentId);
        } catch (error) {
          console.error("Achievement check failed:", error);
        }
      });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error submitting assessment:", error);
    return NextResponse.json(
      { error: "Failed to submit assessment" },
      { status: 500 },
    );
  }
}
