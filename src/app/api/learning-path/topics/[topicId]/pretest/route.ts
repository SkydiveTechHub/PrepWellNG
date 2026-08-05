import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { PRETEST_PASS } from "@/engines/learning/availability";
import { pickRandomQuestionIds } from "@/lib/question-pool";

export const dynamic = "force-dynamic";

// Readiness pretest — 5 questions, ≥80% passes, self-certifies a topic so the
// student can skip the lesson grind (spec algorithm B, Stage 1).
// POST /api/learning-path/topics/[topicId]/pretest
//   {}                      → start: pick 5 objective questions, create an attempt
//   { attemptId, answers }  → grade: complete the attempt, record pretestPassedAt on ≥80%
// See docs/superpowers/specs/2026-08-02-learning-path-engine-design.md

const PRETEST_QUESTION_COUNT = 5;

async function loadPretestTopic(topicId: string) {
  return db.topic.findUnique({
    where: { id: topicId },
    select: {
      id: true,
      title: true,
      subjectId: true,
    },
  });
}

async function hasAlreadyPassed(studentId: string, subjectId: string, topicId: string) {
  const row = await db.performanceMetric.findUnique({
    where: {
      studentId_subjectId_topicId: { studentId, subjectId, topicId },
    },
    select: { pretestPassedAt: true },
  });
  return row?.pretestPassedAt != null;
}

// POST — start (no attemptId) or grade + record (attemptId + answers).
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ topicId: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { topicId } = await params;
    const topic = await loadPretestTopic(topicId);
    if (!topic) {
      return NextResponse.json({ error: "Topic not found" }, { status: 404 });
    }

    const alreadyPassed = await hasAlreadyPassed(
      session.user.id,
      topic.subjectId,
      topic.id,
    );

    const body = await req.json().catch(() => ({}));
    const { attemptId, answers } = body;

    // ── Start a fresh pretest ───────────────────────────────────────────────
    if (!attemptId) {
      // Sampled in the database rather than pulling every candidate id and
      // shuffling in Node — same helper the quiz and mock-exam generators use.
      let source: "topic" | "subject" = "topic";
      let selected = await pickRandomQuestionIds(
        db,
        { subjectId: topic.subjectId, topicIds: [topicId] },
        PRETEST_QUESTION_COUNT,
      );

      // A topic with a sparse bank pads from the subject so the pretest can
      // still run — mirroring the main quiz generator's fallback.
      if (selected.length < PRETEST_QUESTION_COUNT) {
        selected = await pickRandomQuestionIds(
          db,
          { subjectId: topic.subjectId },
          PRETEST_QUESTION_COUNT,
        );
        source = "subject";
      }

      if (selected.length === 0) {
        return NextResponse.json(
          { error: "No questions available for a pretest." },
          { status: 404 },
        );
      }

      const assessment = await db.assessment.create({
        data: {
          title: `Readiness pretest — ${topic.title}`,
          description: `${selected.length} questions · pass at ${PRETEST_PASS}%`,
          assessmentType: "TOPIC_QUIZ",
          subjectId: topic.subjectId,
          totalMarks: selected.length,
          timeLimitMinutes: Math.ceil(selected.length * 1.5),
          questions: {
            create: selected.map((questionId, i) => ({
              questionId,
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
            include: { question: true },
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
      const questions = assessment.questions.map((aq) => ({
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
        attemptId: attempt.id,
        assessmentId: assessment.id,
        title: assessment.title,
        source,
        alreadyPassed,
        totalQuestions: questions.length,
        threshold: PRETEST_PASS,
        questions,
      });
    }

    // ── Grade the attempt ───────────────────────────────────────────────────
    if (!Array.isArray(answers)) {
      return NextResponse.json({ error: "Invalid submission." }, { status: 400 });
    }

    const attempt = await db.assessmentAttempt.findFirst({
      where: {
        id: attemptId,
        studentId: session.user.id,
        status: "IN_PROGRESS",
      },
      include: {
        assessment: {
          include: {
            questions: { include: { question: true } },
          },
        },
      },
    });

    if (!attempt) {
      return NextResponse.json(
        { error: "Pretest attempt not found or already submitted." },
        { status: 404 },
      );
    }

    // Grade each answer against the assessment's questions.
    const questionMap = new Map(
      attempt.assessment.questions.map((aq) => [aq.question.id, aq.question]),
    );
    let correctCount = 0;
    const responseData: Array<{
      attemptId: string;
      questionId: string;
      selectedAnswer: string | null;
      isCorrect: boolean;
      timeSpentSeconds: number | null;
      flaggedForReview: boolean;
    }> = [];
    for (const answer of answers) {
      const question = questionMap.get(answer?.questionId);
      if (!question) continue;
      const isCorrect = answer.selectedAnswer === question.correctAnswer;
      if (isCorrect) correctCount += 1;
      responseData.push({
        attemptId: attempt.id,
        questionId: answer.questionId,
        selectedAnswer: answer.selectedAnswer || null,
        isCorrect,
        timeSpentSeconds: answer.timeSpentSeconds || null,
        flaggedForReview: false,
      });
    }

    const totalQuestions = attempt.assessment.questions.length;
    const percentage = totalQuestions > 0 ? (correctCount / totalQuestions) * 100 : 0;
    const passed = percentage >= PRETEST_PASS;

    await db.$transaction([
      db.questionResponse.createMany({ data: responseData }),
      db.assessmentAttempt.update({
        where: { id: attempt.id },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
          score: correctCount,
          totalMarks: totalQuestions,
          percentage,
          grade: passed ? "Pass" : "Retry",
          timeSpentSeconds: answers.reduce(
            (sum: number, a: { timeSpentSeconds?: number }) =>
              sum + (a.timeSpentSeconds || 0),
            0,
          ),
        },
      }),
    ]);

    // Earned once: a passing pretest sets the flag permanently.
    let record = null;
    if (passed) {
      record = await db.performanceMetric.upsert({
        where: {
          studentId_subjectId_topicId: {
            studentId: session.user.id,
            subjectId: topic.subjectId,
            topicId: topic.id,
          },
        },
        create: {
          studentId: session.user.id,
          subjectId: topic.subjectId,
          topicId: topic.id,
          pretestPassedAt: new Date(),
        },
        update: { pretestPassedAt: new Date() },
      });
    }

    return NextResponse.json({
      passed,
      alreadyPassed,
      percentage: Math.round(percentage * 10) / 10,
      correctCount,
      totalQuestions,
      threshold: PRETEST_PASS,
      recorded: record != null,
    });
  } catch (error) {
    console.error("Error handling readiness pretest:", error);
    return NextResponse.json(
      { error: "Failed to handle readiness pretest" },
      { status: 500 },
    );
  }
}
