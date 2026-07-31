import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { getGrade } from "@/lib/utils";

export const dynamic = "force-dynamic";

// GET /api/assessments/attempts/[attemptId] — fetch attempt results
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ attemptId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { attemptId } = await params;

    const attempt = await db.assessmentAttempt.findFirst({
      where: {
        id: attemptId,
        studentId: session.user.id,
      },
      include: {
        assessment: true,
        responses: {
          include: {
            question: {
              include: {
                topic: { select: { id: true, title: true } },
              },
            },
          },
        },
      },
    });

    if (!attempt) {
      return NextResponse.json(
        { error: "Attempt not found" },
        { status: 404 }
      );
    }

    const percentage = attempt.percentage || 0;
    const gradeInfo = getGrade(percentage);

    // Build question results
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const results = attempt.responses.map((r: any) => ({
      questionId: r.questionId,
      questionText: r.question.questionText,
      questionImageUrl: r.question.questionImageUrl,
      options: r.question.options,
      selectedAnswer: r.selectedAnswer,
      correctAnswer: r.question.correctAnswer,
      isCorrect: r.isCorrect || false,
      explanation: r.question.explanation,
      explanationImageUrl: r.question.explanationImageUrl,
      topic: r.question.topic?.id || null,
      difficulty: r.question.difficulty,
      timeSpentSeconds: r.timeSpentSeconds || 0,
    }));

    // Build topic breakdown
    const topicScores: Record<string, { correct: number; total: number; title: string }> = {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const r of attempt.responses as any[]) {
      const topicId = r.question.topic?.id;
      if (!topicId) continue;
      if (!topicScores[topicId]) {
        topicScores[topicId] = {
          correct: 0,
          total: 0,
          title: r.question.topic?.title || "",
        };
      }
      topicScores[topicId].total += 1;
      if (r.isCorrect) topicScores[topicId].correct += 1;
    }

    const topicBreakdown = Object.entries(topicScores).map(
      ([topicId, data]) => {
        const accuracy =
          data.total > 0 ? (data.correct / data.total) * 100 : 0;
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

    const correctCount = results.filter((r: { isCorrect: boolean }) => r.isCorrect).length;

    return NextResponse.json({
      attemptId: attempt.id,
      assessmentTitle: attempt.assessment.title,
      assessmentType: attempt.assessment.assessmentType,
      score: attempt.score || 0,
      totalMarks: attempt.totalMarks || 0,
      percentage: Math.round(percentage * 10) / 10,
      grade: gradeInfo.grade,
      gradeRemark: gradeInfo.remark,
      isCredit: gradeInfo.isCredit,
      timeSpentSeconds: attempt.timeSpentSeconds || 0,
      totalQuestions: results.length,
      correctCount,
      results,
      topicBreakdown,
    });
  } catch (error) {
    console.error("Error fetching attempt:", error);
    return NextResponse.json(
      { error: "Failed to fetch results" },
      { status: 500 }
    );
  }
}
