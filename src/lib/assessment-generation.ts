import type { ExamType, Difficulty } from "@prisma/client";
import { db } from "./db";
import { pickQuestionsPreferringUnseen } from "./question-pool";
import { deadlineFor } from "./attempt-timing";
import { findResumableAttempt, reapStaleAttempts } from "./attempt-lifecycle";
import {
  describeScopeRange,
  expandScopeRange,
  scopeLabel,
  type ScopePoint,
} from "./curriculum-scope";

/**
 * `correctAnswer` and `explanation` must never reach the client mid-quiz, so
 * the presentable columns are selected explicitly rather than by exclusion.
 */
const presentableQuestionSelect = {
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
} as const;

/** Matches the pacing used elsewhere in the app. */
const MINUTES_PER_QUESTION = 1.5;

export type GenerateQuizInput = {
  subjectSlug?: string;
  subjectId?: string;
  topicIds?: string[];
  topicSlug?: string;
  examType?: ExamType;
  count: number;
  difficulty?: Difficulty;
  title?: string;
  untimed?: boolean;
};

/**
 * Generates a quiz from the question bank, or resumes an unfinished paper of
 * the same shape.
 *
 * The `"subject-not-found"` / `"topic-not-found"` / `"no-questions"` outcomes
 * are returned rather than thrown so the caller keeps its distinct statuses.
 */
export async function generateQuiz(studentId: string, input: GenerateQuizInput) {
  const {
    subjectSlug,
    subjectId,
    topicIds: explicitTopicIds,
    topicSlug,
    examType,
    count,
    difficulty,
    title,
    untimed,
  } = input;

  // Resolve the subject (and topic) in one query. The client used to fetch
  // every subject just to map a slug to an id before it could even ask for
  // questions — three round-trips before the first question rendered.
  const subject = await db.subject.findFirst({
    where: subjectSlug ? { slug: subjectSlug } : { id: subjectId! },
    select: { id: true, name: true },
  });
  if (!subject) return "subject-not-found" as const;

  let topicIds = explicitTopicIds;
  if (!topicIds?.length && topicSlug) {
    const topic = await db.topic.findUnique({
      where: { subjectId_slug: { subjectId: subject.id, slug: topicSlug } },
      select: { id: true },
    });
    if (!topic) return "topic-not-found" as const;
    topicIds = [topic.id];
  }

  const assessmentType = examType ? "PAST_PAPER" : "TOPIC_QUIZ";

  // Hand back an unfinished paper of the same shape rather than minting a new
  // one. Without this a refresh silently built a second assessment and stranded
  // the first as IN_PROGRESS forever.
  await reapStaleAttempts(studentId);
  const resumable = await findResumableAttempt({
    studentId,
    subjectId: subject.id,
    assessmentType,
    examType,
    totalMarks: count,
    topicIds,
  });

  if (resumable) {
    return {
      assessmentId: resumable.assessmentId,
      attemptId: resumable.attemptId,
      title: resumable.title,
      source: "resumed" as const,
      resumed: true,
      totalQuestions: resumable.questions.length,
      timeLimitMinutes: resumable.timeLimitMinutes,
      deadlineAt: resumable.deadlineAt?.toISOString(),
      questions: resumable.questions.map(({ orderIndex, question }) => {
        const { subjectId: _ignored, ...rest } = question;
        void _ignored; // resumed quizzes are single-subject; the id is not shipped
        return { ...rest, questionNumber: orderIndex + 1 };
      }),
    };
  }

  // Try the topic first; fall back to the whole subject when a topic has no
  // tagged questions, so the quiz still surfaces something relevant.
  let source: "topic" | "subject" = "topic";
  let selectedIds = await pickQuestionsPreferringUnseen(
    db,
    { subjectId: subject.id, topicIds, examType, difficulty },
    count,
    studentId,
  );

  if (selectedIds.length === 0 && topicIds?.length) {
    selectedIds = await pickQuestionsPreferringUnseen(
      db,
      { subjectId: subject.id, examType, difficulty },
      count,
      studentId,
    );
    source = "subject";
  }

  if (selectedIds.length === 0) return "no-questions" as const;

  const assessment = await db.assessment.create({
    data: {
      title: title || `${subject.name} Quiz`,
      description: `${selectedIds.length} questions`,
      assessmentType,
      subjectId: subject.id,
      examType: examType || null,
      totalMarks: selectedIds.length,
      // ~1.5 min per question; null for an explicitly untimed quiz such as the
      // classroom quick quiz, so `deadlineFor` never computes one. Which
      // quizzes are untimed is a product rule, not a client choice — only topic
      // quizzes (no examType) may go untimed. A past paper (examType set)
      // always keeps its JAMB-style timing regardless of what the client sends.
      timeLimitMinutes:
        untimed && !examType
          ? null
          : Math.ceil(selectedIds.length * MINUTES_PER_QUESTION),
      questions: {
        create: selectedIds.map((questionId, i) => ({ questionId, orderIndex: i })),
      },
      attempts: {
        create: {
          studentId,
          status: "IN_PROGRESS",
          totalMarks: selectedIds.length,
        },
      },
    },
    include: {
      questions: { select: presentableQuestionSelect, orderBy: { orderIndex: "asc" } },
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
    assessmentId: assessment.id,
    attemptId: attempt.id,
    title: assessment.title,
    source,
    totalQuestions: assessment.questions.length,
    timeLimitMinutes: assessment.timeLimitMinutes,
    // Authoritative deadline — the client counts down against this rather than
    // against its own clock at page load.
    deadlineAt: deadlineFor(
      attempt.startedAt,
      assessment.timeLimitMinutes,
    )?.toISOString(),
    questions: assessment.questions.map((aq) => ({
      ...aq.question,
      questionNumber: aq.orderIndex + 1,
    })),
  };
}

export type ScopedMockExamInput = {
  examType: ExamType;
  subjectId: string;
  from: ScopePoint;
  to: ScopePoint;
  count: number;
};

/**
 * A mock exam drawn from one subject's past questions, restricted to the topics
 * taught in a chosen class/term — or a run of them, e.g. SS1 1st to SS1 3rd.
 */
export async function generateScopedMockExam(
  studentId: string,
  input: ScopedMockExamInput,
) {
  const { examType, subjectId, from, to, count } = input;

  const subject = await db.subject.findUnique({
    where: { id: subjectId },
    select: { id: true, name: true, code: true },
  });
  if (!subject) return "subject-not-found" as const;

  // `expandScopeRange` normalises a reversed range, so picking the endpoints in
  // either order works.
  const scopes = expandScopeRange(from, to);
  const scopeText = describeScopeRange(from, to);

  const selectedIds = await pickQuestionsPreferringUnseen(
    db,
    { subjectId: subject.id, examType, scopes },
    count,
    studentId,
  );

  if (selectedIds.length === 0) {
    return {
      outcome: "no-questions-in-scope" as const,
      message: `No ${examType} ${subject.name} questions are tagged to ${scopeText} yet.`,
      scope: scopes.map(scopeLabel),
    };
  }

  // The bank may hold fewer than asked for. That is fine for a scoped mock —
  // unlike the JAMB CBT, there is no official length to preserve — but the
  // client is told so it can say "30 of the 40 you asked for".
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
        create: selectedIds.map((questionId, i) => ({ questionId, orderIndex: i })),
      },
      attempts: {
        create: { studentId, status: "IN_PROGRESS", totalMarks: actualCount },
      },
    },
    include: {
      questions: { select: presentableQuestionSelect, orderBy: { orderIndex: "asc" } },
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
    outcome: "ok" as const,
    assessmentId: assessment.id,
    attemptId: attempt.id,
    title: assessment.title,
    scope: scopeText,
    subject,
    examType,
    requestedCount: count,
    totalQuestions: actualCount,
    /** True when the bank couldn't fill the requested length. */
    short: actualCount < count,
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
  };
}
