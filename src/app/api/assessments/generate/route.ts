import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { generateQuizSchema } from "@/lib/validators";

// POST /api/assessments/generate — generate a quiz from question bank
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const parsed = generateQuizSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { subjectId, topicIds, examType, count, difficulty } = parsed.data;

    // Build question filter
    const where: Record<string, unknown> = {
      subjectId,
      questionType: "OBJECTIVE", // quizzes use objective questions
    };
    if (topicIds && topicIds.length > 0) where.topicId = { in: topicIds };
    if (examType) where.examType = examType;
    if (difficulty) where.difficulty = difficulty;

    // Fetch candidate questions
    const candidates = await db.question.findMany({
      where,
      select: { id: true },
    });

    if (candidates.length === 0) {
      return NextResponse.json(
        { error: "No questions found matching your criteria." },
        { status: 404 }
      );
    }

    // Shuffle and pick `count` questions (Fisher-Yates)
    const shuffled = [...candidates];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const selected = shuffled.slice(0, Math.min(count, shuffled.length));

    // Get subject info for the assessment title
    const subject = await db.subject.findUnique({
      where: { id: subjectId },
      select: { name: true },
    });

    // Create assessment + assessment questions + attempt
    const assessment = await db.assessment.create({
      data: {
        title: `${subject?.name || "Practice"} Quiz`,
        description: `${selected.length} questions`,
        assessmentType: examType ? "PAST_PAPER" : "TOPIC_QUIZ",
        subjectId,
        examType: examType || null,
        totalMarks: selected.length,
        timeLimitMinutes: Math.ceil(selected.length * 1.5), // ~1.5 min per question
        questions: {
          create: selected.map((q, i) => ({
            questionId: q.id,
            orderIndex: i,
          })),
        },
        attempts: {
          create: {
            studentId: session.user.id,
            status: "IN_PROGRESS",
            totalMarks: selected.length,
          },
        },
      },
      include: {
        questions: {
          include: {
            question: true,
          },
          orderBy: { orderIndex: "asc" },
        },
        attempts: {
          where: { studentId: session.user.id },
          orderBy: { startedAt: "desc" },
          take: 1,
        },
      },
    });

    const attempt = assessment.attempts[0];

    // Strip correct answers from questions sent to client
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const questions = assessment.questions.map((aq: any) => ({
      id: aq.question.id,
      questionNumber: aq.orderIndex + 1,
      questionText: aq.question.questionText,
      questionImageUrl: aq.question.questionImageUrl,
      questionType: aq.question.questionType,
      options: aq.question.options,
      difficulty: aq.question.difficulty,
      marks: aq.question.marks,
      examType: aq.question.examType,
      examYear: aq.question.examYear,
    }));

    return NextResponse.json({
      assessmentId: assessment.id,
      attemptId: attempt.id,
      title: assessment.title,
      totalQuestions: questions.length,
      timeLimitMinutes: assessment.timeLimitMinutes,
      questions,
    });
  } catch (error) {
    console.error("Error generating quiz:", error);
    return NextResponse.json(
      { error: "Failed to generate quiz" },
      { status: 500 }
    );
  }
}
