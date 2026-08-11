import { db } from "./db";
import { PRETEST_PASS } from "@/engines/learning/availability";
import { type NewLearningEvent } from "./learning-events";
import { pickRandomQuestionIds } from "./question-pool";

// Readiness pretest — 5 questions, ≥80% passes, self-certifies a topic so the
// student can skip the lesson grind (spec algorithm B, Stage 1).
// See docs/superpowers/specs/2026-08-02-learning-path-engine-design.md

const PRETEST_QUESTION_COUNT = 5;

export type PretestAnswer = {
  questionId: string;
  selectedAnswer?: string | null;
  timeSpentSeconds?: number | null;
};

type PretestTopic = { id: string; title: string; subjectId: string };

/** The topic under test, or null when the id does not resolve. */
export async function loadPretestTopic(
  topicId: string,
): Promise<PretestTopic | null> {
  return db.topic.findUnique({
    where: { id: topicId },
    select: { id: true, title: true, subjectId: true },
  });
}

/** Whether this student has already self-certified the topic. */
export async function hasAlreadyPassedPretest(
  studentId: string,
  subjectId: string,
  topicId: string,
) {
  const row = await db.performanceMetric.findUnique({
    where: { studentId_subjectId_topicId: { studentId, subjectId, topicId } },
    select: { pretestPassedAt: true },
  });
  return row?.pretestPassedAt != null;
}

/**
 * Starts a fresh pretest: samples questions and opens an attempt.
 * `"no-questions"` means the bank has nothing to draw on.
 */
export async function startPretest(
  studentId: string,
  topic: PretestTopic,
  alreadyPassed: boolean,
) {
  // Sampled in the database rather than pulling every candidate id and
  // shuffling in Node — same helper the quiz and mock-exam generators use.
  let source: "topic" | "subject" = "topic";
  let selected = await pickRandomQuestionIds(
    db,
    { subjectId: topic.subjectId, topicIds: [topic.id] },
    PRETEST_QUESTION_COUNT,
  );

  // A topic with a sparse bank pads from the subject so the pretest can still
  // run — mirroring the main quiz generator's fallback.
  if (selected.length < PRETEST_QUESTION_COUNT) {
    selected = await pickRandomQuestionIds(
      db,
      { subjectId: topic.subjectId },
      PRETEST_QUESTION_COUNT,
    );
    source = "subject";
  }

  if (selected.length === 0) return "no-questions" as const;

  const assessment = await db.assessment.create({
    data: {
      title: `Readiness pretest — ${topic.title}`,
      description: `${selected.length} questions · pass at ${PRETEST_PASS}%`,
      assessmentType: "TOPIC_QUIZ",
      subjectId: topic.subjectId,
      totalMarks: selected.length,
      timeLimitMinutes: Math.ceil(selected.length * 1.5),
      questions: {
        create: selected.map((questionId, i) => ({ questionId, orderIndex: i })),
      },
      attempts: {
        create: {
          studentId,
          status: "IN_PROGRESS",
          totalMarks: selected.length,
        },
      },
    },
    include: {
      questions: { include: { question: true }, orderBy: { orderIndex: "asc" } },
      attempts: {
        where: { studentId },
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

  return {
    attemptId: attempt.id,
    assessmentId: assessment.id,
    title: assessment.title,
    source,
    alreadyPassed,
    totalQuestions: questions.length,
    threshold: PRETEST_PASS,
    questions,
  };
}

/**
 * Grades an open pretest attempt and, on a pass, records the self-certification.
 * `"attempt-not-found"` covers both an unknown id and one already submitted.
 */
export async function gradePretest(
  studentId: string,
  topic: PretestTopic,
  attemptId: string,
  answers: PretestAnswer[],
  alreadyPassed: boolean,
) {
  const attempt = await db.assessmentAttempt.findFirst({
    where: { id: attemptId, studentId, status: "IN_PROGRESS" },
    include: {
      assessment: { include: { questions: { include: { question: true } } } },
    },
  });
  if (!attempt) return "attempt-not-found" as const;

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
  const learningEvents: NewLearningEvent[] = [];

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
    learningEvents.push({
      studentId,
      subjectId: question.subjectId,
      topicId: question.topicId,
      kind: "QUESTION_ANSWERED",
      correct: isCorrect,
      difficulty: question.difficulty,
      seconds: answer.timeSpentSeconds || null,
      sourceId: question.id,
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
          (sum, a) => sum + (a.timeSpentSeconds || 0),
          0,
        ),
      },
    }),
    ...(learningEvents.length > 0
      ? [db.learningEvent.createMany({ data: learningEvents })]
      : []),
  ]);

  // Earned once: a passing pretest sets the flag permanently.
  let recorded = false;
  if (passed) {
    await db.$transaction([
      db.performanceMetric.upsert({
        where: {
          studentId_subjectId_topicId: {
            studentId,
            subjectId: topic.subjectId,
            topicId: topic.id,
          },
        },
        create: {
          studentId,
          subjectId: topic.subjectId,
          topicId: topic.id,
          pretestPassedAt: new Date(),
        },
        update: { pretestPassedAt: new Date() },
      }),
      db.learningEvent.createMany({
        data: [
          {
            studentId,
            subjectId: topic.subjectId,
            topicId: topic.id,
            kind: "PRETEST_PASSED",
            sourceId: topic.id,
          },
        ],
      }),
    ]);
    recorded = true;
  }

  return {
    passed,
    alreadyPassed,
    percentage: Math.round(percentage * 10) / 10,
    correctCount,
    totalQuestions,
    threshold: PRETEST_PASS,
    recorded,
  };
}
