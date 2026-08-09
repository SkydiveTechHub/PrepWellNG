import { db } from "./db";
import { pickRandomQuestionIds } from "./question-pool";
import { deadlineFor } from "./attempt-timing";
import { findResumableAttempt, reapStaleAttempts } from "./attempt-lifecycle";
import { coverageForYear } from "./jamb-availability";
import {
  JAMB_SPEC,
  coverageMessage,
  questionsForSubject,
  selectionErrorMessage,
  validateSubjectChoice,
} from "./jamb-cbt";

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

/**
 * Every way assembling a paper can fail, so the route keeps its distinct
 * statuses (500 / 400 / 422) without re-deriving them from the payload.
 */
export type JambCbtResult =
  | { outcome: "english-missing" }
  | { outcome: "bad-selection"; message: string }
  | { outcome: "subjects-unavailable" }
  | {
      outcome: "insufficient-coverage";
      message: string;
      examYear: number;
      coverage: Awaited<ReturnType<typeof coverageForYear>>["requirements"];
      shortfalls: Awaited<ReturnType<typeof coverageForYear>>["shortfalls"];
    }
  | { outcome: "short-bank"; message: string }
  | { outcome: "ok"; payload: ReturnType<typeof buildPayload> };

/**
 * Assembles one official-shape JAMB paper: English (60) + three chosen subjects
 * (40 each) from a single year, 180 questions in 2 hours, out of 400.
 */
export async function generateJambCbtPaper(
  studentId: string,
  input: { subjectIds: string[]; examYear: number },
): Promise<JambCbtResult> {
  const { subjectIds: chosenIds, examYear } = input;

  const english = await db.subject.findUnique({
    where: { code: JAMB_SPEC.englishCode },
    select: { id: true, code: true, name: true },
  });
  if (!english) return { outcome: "english-missing" };

  const selectionError = validateSubjectChoice(chosenIds, english.id);
  if (selectionError) {
    return { outcome: "bad-selection", message: selectionErrorMessage(selectionError) };
  }

  const chosen = await db.subject.findMany({
    where: { id: { in: chosenIds }, isJamb: true },
    select: { id: true, code: true, name: true },
  });
  if (chosen.length !== chosenIds.length) {
    return { outcome: "subjects-unavailable" };
  }

  // English first so it leads the paper, as in the real CBT.
  const paperSubjects = [english, ...chosen];

  // All-or-nothing: a short paper still marked out of 400 would not be a JAMB
  // simulation, and its score would not compare with a real sitting.
  const coverage = await coverageForYear(paperSubjects, examYear);
  if (!coverage.ok) {
    return {
      outcome: "insufficient-coverage",
      message: coverageMessage(coverage, examYear),
      examYear,
      coverage: coverage.requirements,
      shortfalls: coverage.shortfalls,
    };
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
    return {
      outcome: "ok",
      payload: buildPayload(resumable, paperSubjects, { resumed: true }),
    };
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
    return {
      outcome: "short-bank",
      message: `Couldn't assemble the full ${examYear} paper for ${paperSubjects[short].name}. Please try again.`,
    };
  }

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
        create: picks.flat().map((questionId, i) => ({ questionId, orderIndex: i })),
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

  return {
    outcome: "ok",
    payload: buildPayload(
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
  };
}
