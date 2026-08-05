import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { generateQuizSchema } from "@/lib/validators";
import { pickQuestionsPreferringUnseen } from "@/lib/question-pool";
import { deadlineFor } from "@/lib/attempt-timing";
import {
  findResumableAttempt,
  reapStaleAttempts,
} from "@/lib/attempt-lifecycle";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// POST /api/assessments/generate — generate a quiz from the question bank
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Generation writes an Assessment plus a row per question, so an unbounded
    // caller can inflate the database quickly.
    const limit = rateLimit({
      key: `generate:${session.user.id}`,
      limit: 20,
      windowSeconds: 60,
    });
    if (!limit.ok) return tooManyRequests(limit.retryAfterSeconds);

    const body = await req.json();
    const parsed = generateQuizSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const {
      subjectSlug,
      topicIds: explicitTopicIds,
      topicSlug,
      examType,
      count,
      difficulty,
      title,
    } = parsed.data;

    // Resolve the subject (and topic) in one query. The client used to fetch
    // every subject just to map a slug to an id before it could even ask for
    // questions — three round-trips before the first question rendered.
    const subject = await db.subject.findFirst({
      where: subjectSlug
        ? { slug: subjectSlug }
        : { id: parsed.data.subjectId! },
      select: { id: true, name: true },
    });

    if (!subject) {
      return NextResponse.json({ error: "Subject not found." }, { status: 404 });
    }

    let topicIds = explicitTopicIds;
    if (!topicIds?.length && topicSlug) {
      const topic = await db.topic.findUnique({
        where: { subjectId_slug: { subjectId: subject.id, slug: topicSlug } },
        select: { id: true },
      });
      if (!topic) {
        return NextResponse.json({ error: "Topic not found." }, { status: 404 });
      }
      topicIds = [topic.id];
    }

    const assessmentType = examType ? "PAST_PAPER" : "TOPIC_QUIZ";

    // Hand back an unfinished paper of the same shape rather than minting a new
    // one. Without this a refresh silently built a second assessment and
    // stranded the first as IN_PROGRESS forever.
    await reapStaleAttempts(session.user.id);
    const resumable = await findResumableAttempt({
      studentId: session.user.id,
      subjectId: subject.id,
      assessmentType,
      examType,
      totalMarks: count,
      topicIds,
    });

    if (resumable) {
      return NextResponse.json({
        assessmentId: resumable.assessmentId,
        attemptId: resumable.attemptId,
        title: resumable.title,
        source: "resumed",
        resumed: true,
        totalQuestions: resumable.questions.length,
        timeLimitMinutes: resumable.timeLimitMinutes,
        deadlineAt: resumable.deadlineAt?.toISOString(),
        questions: resumable.questions.map(({ orderIndex, question }) => {
          const { subjectId, ...rest } = question;
          void subjectId; // resumed quizzes are single-subject; the id is not shipped
          return { ...rest, questionNumber: orderIndex + 1 };
        }),
      });
    }

    // Try the topic first; fall back to the whole subject when a topic has no
    // tagged questions, so the quiz still surfaces something relevant.
    let source: "topic" | "subject" = "topic";
    let selectedIds = await pickQuestionsPreferringUnseen(
      db,
      { subjectId: subject.id, topicIds, examType, difficulty },
      count,
      session.user.id,
    );

    if (selectedIds.length === 0 && topicIds?.length) {
      selectedIds = await pickQuestionsPreferringUnseen(
        db,
        { subjectId: subject.id, examType, difficulty },
        count,
        session.user.id,
      );
      source = "subject";
    }

    if (selectedIds.length === 0) {
      return NextResponse.json(
        { error: "No questions found matching your criteria." },
        { status: 404 },
      );
    }

    const assessmentTitle = title || `${subject.name} Quiz`;

    const assessment = await db.assessment.create({
      data: {
        title: assessmentTitle,
        description: `${selectedIds.length} questions`,
        assessmentType,
        subjectId: subject.id,
        examType: examType || null,
        totalMarks: selectedIds.length,
        timeLimitMinutes: Math.ceil(selectedIds.length * 1.5), // ~1.5 min per question
        questions: {
          create: selectedIds.map((questionId, i) => ({
            questionId,
            orderIndex: i,
          })),
        },
        attempts: {
          create: {
            studentId: session.user.id,
            status: "IN_PROGRESS",
            totalMarks: selectedIds.length,
          },
        },
      },
      include: {
        questions: {
          // `correctAnswer` and `explanation` must never reach the client
          // mid-quiz — select the presentable columns explicitly.
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
          where: { studentId: session.user.id },
          orderBy: { startedAt: "desc" },
          take: 1,
          select: { id: true, startedAt: true },
        },
      },
    });

    const questions = assessment.questions.map((aq) => ({
      ...aq.question,
      questionNumber: aq.orderIndex + 1,
    }));

    const attempt = assessment.attempts[0];

    return NextResponse.json({
      assessmentId: assessment.id,
      attemptId: attempt.id,
      title: assessment.title,
      source,
      totalQuestions: questions.length,
      timeLimitMinutes: assessment.timeLimitMinutes,
      // Authoritative deadline — the client counts down against this rather
      // than against its own clock at page load.
      deadlineAt: deadlineFor(
        attempt.startedAt,
        assessment.timeLimitMinutes,
      )?.toISOString(),
      questions,
    });
  } catch (error) {
    console.error("Error generating quiz:", error);
    return NextResponse.json(
      { error: "Failed to generate quiz" },
      { status: 500 },
    );
  }
}
