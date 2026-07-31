import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { submitAssessmentSchema } from "@/lib/validators";
import { getGrade } from "@/lib/utils";

export const dynamic = "force-dynamic";

// POST /api/assessments/submit — submit answers and get results
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const parsed = submitAssessmentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { attemptId, answers } = parsed.data;

    // Verify the attempt belongs to this user and is in progress
    const attempt = await db.assessmentAttempt.findFirst({
      where: {
        id: attemptId,
        studentId: session.user.id,
        status: "IN_PROGRESS",
      },
      include: {
        assessment: {
          include: {
            questions: {
              include: {
                question: true,
              },
            },
          },
        },
      },
    });

    if (!attempt) {
      return NextResponse.json(
        { error: "Assessment attempt not found or already submitted." },
        { status: 404 }
      );
    }

    // Build a map of question id -> correct answer
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const questionMap = new Map<string, any>(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      attempt.assessment.questions.map((aq: any) => [
        aq.question.id,
        aq.question,
      ])
    );

    // Grade each answer
    let totalCorrect = 0;
    let totalMarks = 0;
    const questionResults = [];
    const responseData = [];
    const topicScores: Record<string, { correct: number; total: number; title: string }> = {};

    for (const answer of answers) {
      const question = questionMap.get(answer.questionId);
      if (!question) continue;

      const isCorrect = answer.selectedAnswer === question.correctAnswer;
      if (isCorrect) totalCorrect += question.marks;
      totalMarks += question.marks;

      // Track topic performance
      if (question.topicId) {
        if (!topicScores[question.topicId]) {
          topicScores[question.topicId] = { correct: 0, total: 0, title: "" };
        }
        topicScores[question.topicId].total += 1;
        if (isCorrect) topicScores[question.topicId].correct += 1;
      }

      responseData.push({
        attemptId,
        questionId: answer.questionId,
        selectedAnswer: answer.selectedAnswer || null,
        isCorrect,
        timeSpentSeconds: answer.timeSpentSeconds || null,
        flaggedForReview: answer.flaggedForReview || false,
      });

      questionResults.push({
        questionId: question.id,
        questionText: question.questionText,
        questionImageUrl: question.questionImageUrl,
        options: question.options,
        selectedAnswer: answer.selectedAnswer || null,
        correctAnswer: question.correctAnswer,
        isCorrect,
        explanation: question.explanation,
        explanationImageUrl: question.explanationImageUrl,
        topic: question.topicId,
        difficulty: question.difficulty,
        timeSpentSeconds: answer.timeSpentSeconds || 0,
      });
    }

    const percentage = totalMarks > 0 ? (totalCorrect / totalMarks) * 100 : 0;
    const gradeInfo = getGrade(percentage);
    const totalTimeSpent = answers.reduce(
      (sum, a) => sum + (a.timeSpentSeconds || 0),
      0
    );

    // Save responses and update attempt — in a transaction
    await db.$transaction([
      // Create all question responses
      db.questionResponse.createMany({
        data: responseData,
      }),
      // Update the attempt
      db.assessmentAttempt.update({
        where: { id: attemptId },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
          score: totalCorrect,
          totalMarks,
          percentage,
          grade: gradeInfo.grade,
          timeSpentSeconds: totalTimeSpent,
        },
      }),
    ]);

    // Resolve topic titles
    const topicIds = Object.keys(topicScores);
    if (topicIds.length > 0) {
      const topics = await db.topic.findMany({
        where: { id: { in: topicIds } },
        select: { id: true, title: true },
      });
      for (const t of topics) {
        if (topicScores[t.id]) topicScores[t.id].title = t.title;
      }
    }

    const topicBreakdown = Object.entries(topicScores).map(
      ([topicId, data]) => {
        const accuracy = data.total > 0 ? (data.correct / data.total) * 100 : 0;
        return {
          topicId,
          topicTitle: data.title,
          correct: data.correct,
          total: data.total,
          accuracy,
          status:
            accuracy >= 80
              ? "strong"
              : accuracy >= 60
                ? "competent"
                : accuracy >= 40
                  ? "developing"
                  : "weak",
        };
      }
    );

    // Fire-and-forget achievement check
    checkAchievements(session.user.id).catch(() => {});

    return NextResponse.json({
      attemptId,
      assessmentTitle: attempt.assessment.title,
      assessmentType: attempt.assessment.assessmentType,
      score: totalCorrect,
      totalMarks,
      percentage: Math.round(percentage * 10) / 10,
      grade: gradeInfo.grade,
      gradeRemark: gradeInfo.remark,
      isCredit: gradeInfo.isCredit,
      timeSpentSeconds: totalTimeSpent,
      totalQuestions: questionResults.length,
      correctCount: questionResults.filter((r) => r.isCorrect).length,
      results: questionResults,
      topicBreakdown,
    });
  } catch (error) {
    console.error("Error submitting assessment:", error);
    return NextResponse.json(
      { error: "Failed to submit assessment" },
      { status: 500 }
    );
  }
}

async function checkAchievements(userId: string) {
  const db = (await import("@/lib/db")).db;
  const allAchievements = await db.achievement.findMany();
  const earned = await db.studentAchievement.findMany({
    where: { studentId: userId },
    select: { achievementId: true },
  });
  const earnedIds = new Set(earned.map((e) => e.achievementId));

  for (const achievement of allAchievements) {
    if (earnedIds.has(achievement.id)) continue;

    let shouldAward = false;
    switch (achievement.criteriaType) {
      case "questions_answered": {
        const count = await db.questionResponse.count({
          where: { attempt: { studentId: userId } },
        });
        if (count >= achievement.criteriaValue) shouldAward = true;
        break;
      }
      case "perfect_score": {
        const perfect = await db.assessmentAttempt.findFirst({
          where: { studentId: userId, status: "COMPLETED", percentage: { gte: 100 } },
        });
        if (perfect) shouldAward = true;
        break;
      }
      case "streak_days": {
        const recent = await db.assessmentAttempt.findMany({
          where: { studentId: userId, status: "COMPLETED" },
          select: { completedAt: true },
          orderBy: { completedAt: "desc" },
        });
        if (recent.length > 0) {
          const dates = [...new Set(recent.map((a: { completedAt: Date | null }) =>
            a.completedAt ? new Date(a.completedAt).toISOString().slice(0, 10) : ""
          ))].filter(Boolean).sort().reverse();
          let streak = 1;
          for (let i = 1; i < dates.length; i++) {
            const diff = (new Date(dates[i - 1]).getTime() - new Date(dates[i]).getTime()) / (1000 * 60 * 60 * 24);
            if (Math.abs(diff) <= 1.5) streak++;
            else break;
          }
          const today = new Date().toISOString().slice(0, 10);
          if (streak >= achievement.criteriaValue && dates[0] === today) {
            shouldAward = true;
          }
        }
        break;
      }
      case "lessons_completed": {
        const done = await db.studentProgress.count({
          where: { studentId: userId, status: "COMPLETED", lessonId: { not: null } },
        });
        if (done >= achievement.criteriaValue) shouldAward = true;
        break;
      }
      case "subject_mastery": {
        const strong = await db.performanceMetric.count({
          where: { studentId: userId, masteryLevel: "STRONG" },
        });
        if (strong >= achievement.criteriaValue) shouldAward = true;
        break;
      }
      case "mock_score_70": {
        const high = await db.assessmentAttempt.findFirst({
          where: {
            studentId: userId,
            status: "COMPLETED",
            percentage: { gte: 70 },
            assessment: { assessmentType: "MOCK_EXAM" },
          },
        });
        if (high) shouldAward = true;
        break;
      }
    }

    if (shouldAward) {
      await db.studentAchievement.create({
        data: { studentId: userId, achievementId: achievement.id },
      });
    }
  }
}
