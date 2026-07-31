import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { mockExamSchema } from "@/lib/validators";

// POST /api/assessments/mock-exam/generate — generate a multi-subject mock exam
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: { track: true },
    });

    const body = await req.json();
    const parsed = mockExamSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { examType, subjectId, jambSubjectIds } = parsed.data;

    // Determine which subjects to include
    let subjectIds: string[] = [];

    if (examType === "JAMB") {
      // English + 3 chosen subjects
      const english = await db.subject.findUnique({ where: { code: "ENG" }, select: { id: true } });
      if (!english) {
        return NextResponse.json({ error: "English subject not found" }, { status: 404 });
      }
      subjectIds = [english.id];
      if (jambSubjectIds && jambSubjectIds.length > 0) {
        subjectIds.push(...jambSubjectIds);
      } else {
        // Auto-pick based on student's track
        const codes = user?.track === "SCIENCE" ? ["PHY", "CHM", "BIO"]
          : user?.track === "ARTS" ? ["LIT", "GOV", "CRS"]
          : user?.track === "COMMERCIAL" ? ["ECO", "ACC", "COM"]
          : ["PHY", "CHM", "BIO"];
        const subjects = await db.subject.findMany({ where: { code: { in: codes } }, select: { id: true } });
        subjectIds.push(...subjects.map((s) => s.id));
      }
    } else {
      // WAEC / NECO — single subject or pick one
      if (subjectId) {
        subjectIds = [subjectId];
      } else {
        // Pick a random subject with questions for this exam type
        const available = await db.question.findMany({
          where: { examType },
          select: { subjectId: true },
          distinct: ["subjectId"],
          take: 1,
        });
        if (available.length === 0) {
          return NextResponse.json(
            { error: `No ${examType} questions available.` },
            { status: 404 }
          );
        }
        subjectIds = [available[0].subjectId];
      }
    }

    if (subjectIds.length === 0) {
      return NextResponse.json({ error: "No subjects selected" }, { status: 400 });
    }

    // Fetch questions for each subject
    const questionsPerSubject = Math.floor(45 / subjectIds.length);
    const allQuestions: Array<{ id: string; subjectId: string }> = [];

    for (const sid of subjectIds) {
      const candidates = await db.question.findMany({
        where: { subjectId: sid, examType, questionType: "OBJECTIVE" },
        select: { id: true },
      });

      if (candidates.length === 0) continue;

      // Shuffle and pick
      const shuffled = [...candidates];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      const selected = shuffled.slice(0, Math.min(questionsPerSubject, shuffled.length));
      allQuestions.push(...selected.map((q) => ({ id: q.id, subjectId: sid })));
    }

    if (allQuestions.length === 0) {
      return NextResponse.json(
        { error: "No questions found for the selected subjects." },
        { status: 404 }
      );
    }

    // Get subject names
    const subjects = await db.subject.findMany({
      where: { id: { in: subjectIds } },
      select: { id: true, name: true, slug: true, code: true },
    });
    const subjectMap = new Map(subjects.map((s) => [s.id, s]));

    // Get full question data
    const questionIds = allQuestions.map((q) => q.id);
    const questions = await db.question.findMany({
      where: { id: { in: questionIds } },
    });
    const questionMap = new Map(questions.map((q) => [q.id, q]));

    const totalMarks = allQuestions.length;
    const timeLimitMinutes = Math.ceil(totalMarks * 1.5);

    // Create assessment + questions + attempt
    const title = `${examType} Mock Exam`;

    const assessment = await db.assessment.create({
      data: {
        title,
        description: `${allQuestions.length} questions across ${subjectIds.length} subjects`,
        assessmentType: "MOCK_EXAM",
        examType,
        totalMarks,
        timeLimitMinutes,
        passMarkPercent: 50,
        questions: {
          create: allQuestions.map((q, i) => ({
            questionId: q.id,
            orderIndex: i,
          })),
        },
        attempts: {
          create: {
            studentId: session.user.id,
            status: "IN_PROGRESS",
            totalMarks,
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

    const responseQuestions = assessment.questions.map((aq) => {
      const sub = subjectMap.get(aq.question.subjectId);
      return {
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
        subjectName: sub?.name || "Unknown",
        subjectCode: sub?.code || "",
      };
    });

    return NextResponse.json({
      assessmentId: assessment.id,
      attemptId: attempt.id,
      title: assessment.title,
      totalQuestions: responseQuestions.length,
      timeLimitMinutes: assessment.timeLimitMinutes,
      subjects: subjects.map((s) => ({ id: s.id, name: s.name, slug: s.slug, code: s.code })),
      questions: responseQuestions,
    });
  } catch (error) {
    console.error("Error generating mock exam:", error);
    return NextResponse.json(
      { error: "Failed to generate mock exam" },
      { status: 500 }
    );
  }
}
