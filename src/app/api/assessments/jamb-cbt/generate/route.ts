import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { jambCbtSchema } from "@/lib/validators";
import { pickRandomQuestionIds } from "@/lib/question-pool";
import { deadlineFor } from "@/lib/attempt-timing";
import {
  findResumableAttempt,
  reapStaleAttempts,
} from "@/lib/attempt-lifecycle";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { coverageForYear } from "@/lib/jamb-availability";
import {
  JAMB_SPEC,
  coverageMessage,
  questionsForSubject,
  selectionErrorMessage,
  validateSubjectChoice,
} from "@/lib/jamb-cbt";

export const dynamic = "force-dynamic";

// POST /api/assessments/jamb-cbt/generate
// Assembles one official-shape JAMB paper: English (60) + three chosen
// subjects (40 each) from a single year, 180 questions in 2 hours, out of 400.
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const studentId = session.user.id;

    // The heaviest generator in the app: 180 questions and 180 join rows.
    const limit = rateLimit({
      key: `jamb-cbt:${studentId}`,
      limit: 6,
      windowSeconds: 60,
    });
    if (!limit.ok) return tooManyRequests(limit.retryAfterSeconds);

    const parsed = jambCbtSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const { subjectIds: chosenIds, examYear } = parsed.data;

    const english = await db.subject.findUnique({
      where: { code: JAMB_SPEC.englishCode },
      select: { id: true, code: true, name: true },
    });
    if (!english) {
      return NextResponse.json(
        { error: "English Language is not set up in the subject catalogue." },
        { status: 500 },
      );
    }

    const selectionError = validateSubjectChoice(chosenIds, english.id);
    if (selectionError) {
      return NextResponse.json(
        { error: selectionErrorMessage(selectionError) },
        { status: 400 },
      );
    }

    const chosen = await db.subject.findMany({
      where: { id: { in: chosenIds }, isJamb: true },
      select: { id: true, code: true, name: true },
    });
    if (chosen.length !== chosenIds.length) {
      return NextResponse.json(
        { error: "One or more chosen subjects aren't available for JAMB." },
        { status: 400 },
      );
    }

    // English first so it leads the paper, as in the real CBT.
    const paperSubjects = [english, ...chosen];

    // All-or-nothing: a short paper still marked out of 400 would not be a JAMB
    // simulation, and its score would not compare with a real sitting.
    const coverage = await coverageForYear(paperSubjects, examYear);
    if (!coverage.ok) {
      return NextResponse.json(
        {
          error: coverageMessage(coverage, examYear),
          reason: "INSUFFICIENT_QUESTIONS",
          examYear,
          coverage: coverage.requirements,
          shortfalls: coverage.shortfalls,
        },
        { status: 422 },
      );
    }

    await reapStaleAttempts(studentId);
    const resumable = await findResumableAttempt({
      studentId,
      assessmentType: "CBT_PRACTICE",
      examType: "JAMB",
      totalMarks: JAMB_SPEC.totalMarks,
      examYear,
    });

    if (resumable) {
      return NextResponse.json(
        buildPayload(resumable, paperSubjects, { resumed: true }),
      );
    }

    // Sample each subject to its official count, in parallel.
    const picks = await Promise.all(
      paperSubjects.map((subject) =>
        pickRandomQuestionIds(
          db,
          { subjectId: subject.id, examType: "JAMB" },
          questionsForSubject(subject.code),
        ),
      ),
    );

    // Coverage was checked a moment ago, but the bank could have changed under
    // us; never hand out a paper that is quietly the wrong length.
    const short = picks.findIndex(
      (ids, i) => ids.length < questionsForSubject(paperSubjects[i].code),
    );
    if (short !== -1) {
      return NextResponse.json(
        {
          error: `Couldn't assemble the full ${examYear} paper for ${paperSubjects[short].name}. Please try again.`,
          reason: "INSUFFICIENT_QUESTIONS",
        },
        { status: 422 },
      );
    }

    const orderedQuestionIds = picks.flat();

    const assessment = await db.assessment.create({
      data: {
        title: `JAMB ${examYear} CBT Simulation`,
        description: `${JAMB_SPEC.totalQuestions} questions across ${paperSubjects.length} subjects · ${JAMB_SPEC.durationMinutes} minutes · marked out of ${JAMB_SPEC.totalMarks}`,
        assessmentType: "CBT_PRACTICE",
        examType: "JAMB",
        examYear,
        // The real paper is marked out of 400 with every subject worth 100,
        // regardless of how many questions it carries.
        totalMarks: JAMB_SPEC.totalMarks,
        timeLimitMinutes: JAMB_SPEC.durationMinutes,
        passMarkPercent: 50,
        questions: {
          create: orderedQuestionIds.map((questionId, i) => ({
            questionId,
            orderIndex: i,
          })),
        },
        attempts: {
          create: {
            studentId,
            status: "IN_PROGRESS",
            totalMarks: JAMB_SPEC.totalMarks,
          },
        },
      },
      include: {
        questions: {
          // correctAnswer and explanation must never reach an in-progress paper.
          select: {
            orderIndex: true,
            question: {
              select: {
                id: true,
                subjectId: true,
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

    return NextResponse.json(
      buildPayload(
        {
          attemptId: attempt.id,
          assessmentId: assessment.id,
          title: assessment.title,
          timeLimitMinutes: assessment.timeLimitMinutes,
          deadlineAt: deadlineFor(attempt.startedAt, assessment.timeLimitMinutes),
          examYear,
          questions: assessment.questions,
        },
        paperSubjects,
        { resumed: false },
      ),
    );
  } catch (error) {
    console.error("Error generating JAMB CBT paper:", error);
    return NextResponse.json(
      { error: "Failed to generate the CBT paper" },
      { status: 500 },
    );
  }
}

type PaperSource = {
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

function buildPayload(
  source: PaperSource,
  subjects: readonly { id: string; code: string; name: string }[],
  { resumed }: { resumed: boolean },
) {
  const byId = new Map(subjects.map((s) => [s.id, s]));

  return {
    assessmentId: source.assessmentId,
    attemptId: source.attemptId,
    title: source.title,
    examYear: source.examYear,
    resumed,
    totalQuestions: source.questions.length,
    timeLimitMinutes: source.timeLimitMinutes,
    totalMarks: JAMB_SPEC.totalMarks,
    deadlineAt: source.deadlineAt?.toISOString(),
    subjects: subjects.map((s) => ({ ...s })),
    questions: source.questions.map(({ orderIndex, question }) => {
      const { subjectId, ...rest } = question;
      const subject = byId.get(subjectId);
      return {
        ...rest,
        questionNumber: orderIndex + 1,
        subjectName: subject?.name ?? "Unknown",
        subjectCode: subject?.code ?? "",
      };
    }),
  };
}
