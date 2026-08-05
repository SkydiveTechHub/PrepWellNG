import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { scopedMockExamSchema } from "@/lib/validators";
import { pickQuestionsPreferringUnseen } from "@/lib/question-pool";
import { deadlineFor } from "@/lib/attempt-timing";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import {
  describeScopeRange,
  expandScopeRange,
  scopeLabel,
} from "@/lib/curriculum-scope";

export const dynamic = "force-dynamic";

/** Matches the pacing used elsewhere in the app. */
const MINUTES_PER_QUESTION = 1.5;

// POST /api/assessments/mock-exam/scoped
// A mock exam drawn from one subject's past questions, restricted to the topics
// taught in a chosen class/term — or a run of them, e.g. SS1 1st to SS1 3rd.
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const studentId = session.user.id;

    const limit = rateLimit({
      key: `scoped-mock:${studentId}`,
      limit: 12,
      windowSeconds: 60,
    });
    if (!limit.ok) return tooManyRequests(limit.retryAfterSeconds);

    const parsed = scopedMockExamSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const { examType, subjectId, from, to, count } = parsed.data;

    const subject = await db.subject.findUnique({
      where: { id: subjectId },
      select: { id: true, name: true, code: true },
    });
    if (!subject) {
      return NextResponse.json({ error: "Subject not found." }, { status: 404 });
    }

    // `expandScopeRange` normalises a reversed range, so picking the endpoints
    // in either order works.
    const scopes = expandScopeRange(from, to);
    const scopeText = describeScopeRange(from, to);

    const selectedIds = await pickQuestionsPreferringUnseen(
      db,
      { subjectId: subject.id, examType, scopes },
      count,
      studentId,
    );

    if (selectedIds.length === 0) {
      return NextResponse.json(
        {
          error: `No ${examType} ${subject.name} questions are tagged to ${scopeText} yet.`,
          reason: "NO_QUESTIONS_IN_SCOPE",
          scope: scopes.map(scopeLabel),
        },
        { status: 422 },
      );
    }

    // The bank may hold fewer than asked for. That is fine for a scoped mock —
    // unlike the JAMB CBT, there is no official length to preserve — but the
    // client is told so it can say "30 of the 40 you asked for".
    const requestedCount = count;
    const actualCount = selectedIds.length;

    const assessment = await db.assessment.create({
      data: {
        title: `${subject.name} Mock · ${scopeText}`,
        description: `${actualCount} ${examType} questions from ${scopeText}`,
        assessmentType: "MOCK_EXAM",
        subjectId: subject.id,
        examType,
        totalMarks: actualCount,
        timeLimitMinutes: Math.ceil(actualCount * MINUTES_PER_QUESTION),
        questions: {
          create: selectedIds.map((questionId, i) => ({
            questionId,
            orderIndex: i,
          })),
        },
        attempts: {
          create: {
            studentId,
            status: "IN_PROGRESS",
            totalMarks: actualCount,
          },
        },
      },
      include: {
        questions: {
          // correctAnswer and explanation must never reach an in-progress exam.
          select: {
            orderIndex: true,
            question: {
              select: {
                id: true,
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
          orderBy: { orderIndex: "asc" },
        },
        attempts: {
          where: { studentId },
          orderBy: { startedAt: "desc" },
          take: 1,
          select: { id: true, startedAt: true },
        },
      },
    });

    const attempt = assessment.attempts[0];

    return NextResponse.json({
      assessmentId: assessment.id,
      attemptId: attempt.id,
      title: assessment.title,
      scope: scopeText,
      subject,
      examType,
      requestedCount,
      totalQuestions: actualCount,
      /** True when the bank couldn't fill the requested length. */
      short: actualCount < requestedCount,
      timeLimitMinutes: assessment.timeLimitMinutes,
      deadlineAt: deadlineFor(
        attempt.startedAt,
        assessment.timeLimitMinutes,
      )?.toISOString(),
      questions: assessment.questions.map(({ orderIndex, question }) => ({
        ...question,
        questionNumber: orderIndex + 1,
        subjectName: subject.name,
        subjectCode: subject.code,
      })),
    });
  } catch (error) {
    console.error("Error generating scoped mock exam:", error);
    return NextResponse.json(
      { error: "Failed to generate the mock exam" },
      { status: 500 },
    );
  }
}
