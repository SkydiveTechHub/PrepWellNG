import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { summariseSubjects, toStatRows, type StatRow } from "./admin-stats";
import { parseBlocks } from "./lesson-engine";
import { isAuthored } from "./admin-lesson";
import { resolveTopicLesson, topicLessonSelectWith } from "./classroom";
import {
  groupByClass,
  levelsPresent,
  type ClassSection,
  type LessonFilter,
} from "./admin-lesson-browse";
import type { ClassLevel, Term } from "./curriculum-scope";

/**
 * Database access for the admin pages. Kept apart from `admin-stats`,
 * `admin-question` and `admin-lesson`, which stay pure so their tests can run
 * without a database.
 */

export type AdminOverviewData = {
  total: number;
  subjectCount: number;
  topicCount: number;
  unlinkedCount: number;
  subjectRows: StatRow[];
  /** Subject code by subject id, for the code column on the subject table. */
  codeBySubjectId: Record<string, string>;
  emptySubjects: { id: string; name: string; code: string }[];
  examRows: StatRow[];
  difficultyRows: StatRow[];
  examYears: number[];
};

export async function getAdminOverview(): Promise<AdminOverviewData> {
  const [subjects, topicCount, unlinkedCount, byExam, byDifficulty, years] =
    await Promise.all([
      db.subject.findMany({
        select: {
          id: true,
          name: true,
          code: true,
          _count: { select: { questions: true } },
        },
        orderBy: { name: "asc" },
      }),
      db.topic.count(),
      db.question.count({ where: { topicId: null } }),
      db.question.groupBy({ by: ["examType"], _count: { _all: true } }),
      db.question.groupBy({ by: ["difficulty"], _count: { _all: true } }),
      db.question.findMany({
        where: { examYear: { not: null } },
        distinct: ["examYear"],
        select: { examYear: true },
        orderBy: { examYear: "desc" },
      }),
    ]);

  const summary = summariseSubjects(
    subjects.map((s) => ({
      id: s.id,
      name: s.name,
      code: s.code,
      questionCount: s._count.questions,
    })),
  );

  const codeBySubjectId: Record<string, string> = {};
  for (const s of subjects) codeBySubjectId[s.id] = s.code;

  return {
    total: summary.total,
    subjectCount: subjects.length,
    topicCount,
    unlinkedCount,
    subjectRows: summary.rows,
    codeBySubjectId,
    emptySubjects: summary.empty.map((s) => ({
      id: s.id,
      name: s.name,
      code: s.code,
    })),
    examRows: toStatRows(
      byExam.map((r) => ({ key: r.examType, label: r.examType, count: r._count._all })),
      summary.total,
    ),
    difficultyRows: toStatRows(
      byDifficulty.map((r) => ({
        key: r.difficulty,
        label: r.difficulty,
        count: r._count._all,
      })),
      summary.total,
    ),
    // `examYear` is only null-checked in the query, so the nulls are already gone.
    examYears: years.map((y) => y.examYear).filter((y): y is number => y !== null),
  };
}

export type QuestionFormOptions = {
  subjects: { id: string; name: string; code: string }[];
  topics: { id: string; title: string; subjectId: string }[];
};

/** Subject and topic pickers for the question create/edit forms. */
export async function getQuestionFormOptions(): Promise<QuestionFormOptions> {
  const [subjects, topics] = await Promise.all([
    db.subject.findMany({
      select: { id: true, name: true, code: true },
      orderBy: { name: "asc" },
    }),
    db.topic.findMany({
      select: { id: true, title: true, subjectId: true },
      orderBy: { title: "asc" },
    }),
  ]);
  return { subjects, topics };
}

export type LessonUploadSubject = {
  id: string;
  name: string;
  slug: string;
  topics: {
    id: string;
    title: string;
    slug: string;
    curriculumLevel: { classLevel: string; term: string };
  }[];
};

export type LessonTopicRow = {
  topicId: string;
  topicTitle: string;
  classLevel: ClassLevel;
  term: Term;
  blockCount: number;
  authored: boolean;
};

export type AdminLessonBrowseData = {
  subjects: { id: string; name: string; trackCategory: string }[];
  rows: LessonTopicRow[];
  sections: ClassSection<LessonTopicRow>[];
  classLevels: ClassLevel[];
  terms: Term[];
  authoredCount: number;
  selectedSubjectName: string | null;
};

export async function getAdminLessonBrowseData(
  filter: LessonFilter,
): Promise<AdminLessonBrowseData> {
  // Always cheap, and it drives both dropdowns.
  const subjects = await db.subject.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, trackCategory: true },
  });

  // Only a chosen subject pulls topics and their lesson blocks. With nothing
  // selected the page does no topic work at all — the flat list this page used
  // to render loaded every lesson in the database.
  const topics = filter.subjectId
    ? await db.topic.findMany({
        where: {
          subjectId: filter.subjectId,
          curriculumLevel: {
            ...(filter.classLevel ? { classLevel: filter.classLevel } : {}),
            ...(filter.term ? { term: filter.term } : {}),
          },
        },
        orderBy: [
          { curriculumLevel: { classLevel: "asc" } },
          { curriculumLevel: { term: "asc" } },
          { orderIndex: "asc" },
        ],
        select: {
          id: true,
          title: true,
          curriculumLevel: { select: { classLevel: true, term: true } },
          // Canonical fragment, so this list reports on the same lesson the
          // Classroom renders. Hand-rolling the shape here is how the two
          // drifted apart.
          subtopics: topicLessonSelectWith({ blocks: true, createdBy: true }),
        },
      })
    : [];

  const rows: LessonTopicRow[] = topics.map((topic) => {
    const lesson = resolveTopicLesson(topic);
    return {
      topicId: topic.id,
      topicTitle: topic.title,
      classLevel: topic.curriculumLevel.classLevel as ClassLevel,
      term: topic.curriculumLevel.term as Term,
      blockCount: lesson ? parseBlocks(lesson.blocks).length : 0,
      authored: lesson ? isAuthored(lesson.createdBy) : false,
    };
  });

  // Dropdown options come from the subject's *whole* topic set, never from the
  // filtered rows: deriving them from `topics` would leave the current class as
  // the only class on offer and strand the admin there. Ids only, so it stays
  // cheap next to the query above.
  const levelSource = filter.subjectId
    ? await db.topic.findMany({
        where: { subjectId: filter.subjectId },
        select: { curriculumLevel: { select: { classLevel: true, term: true } } },
      })
    : [];
  const { classLevels, terms } = levelsPresent(
    levelSource.map((t) => t.curriculumLevel),
    filter.classLevel,
  );

  return {
    subjects,
    rows,
    sections: groupByClass(rows),
    classLevels,
    terms,
    authoredCount: rows.filter((r) => r.authored).length,
    selectedSubjectName:
      subjects.find((s) => s.id === filter.subjectId)?.name ?? null,
  };
}

/**
 * `Question.options` is a nullable Json column, so Prisma types it as
 * `Prisma.JsonValue` — it could be a string, number, array, or anything else a
 * stray write put there. Only a plain, non-array object of string values is a
 * valid options map; anything else is treated as absent rather than cast
 * blindly (which would otherwise crash the form on unexpected JSON).
 */
function toOptionsRecord(
  value: Prisma.JsonValue | null,
): Record<string, string> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const out: Record<string, string> = {};
  for (const [key, val] of Object.entries(value)) {
    out[key] = typeof val === "string" ? val : String(val);
  }
  return out;
}

/** The question being edited plus the form's pickers, or null if it is gone. */
export async function getQuestionForEdit(id: string) {
  const [question, options] = await Promise.all([
    db.question.findUnique({
      where: { id },
      select: {
        id: true,
        subjectId: true,
        topicId: true,
        examType: true,
        examYear: true,
        questionNumber: true,
        questionText: true,
        questionImageUrl: true,
        questionType: true,
        options: true,
        correctAnswer: true,
        explanation: true,
        explanationImageUrl: true,
        difficulty: true,
        marks: true,
        timeEstimateSeconds: true,
      },
    }),
    getQuestionFormOptions(),
  ]);

  if (!question) return null;

  return {
    question: { ...question, options: toOptionsRecord(question.options) },
    subjects: options.subjects,
    topics: options.topics,
  };
}

/** The subject → topic tree the lesson upload form picks a target from. */
export async function getLessonUploadSubjects(): Promise<LessonUploadSubject[]> {
  return db.subject.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      slug: true,
      topics: {
        orderBy: { orderIndex: "asc" },
        select: {
          id: true,
          title: true,
          slug: true,
          curriculumLevel: { select: { classLevel: true, term: true } },
        },
      },
    },
  });
}

/** Dependent counts powering the delete-confirmation dialog. */
export async function getQuestionUsage(questionId: string) {
  const [responseCount, assessmentCount] = await Promise.all([
    db.questionResponse.count({ where: { questionId } }),
    db.assessmentQuestion.count({ where: { questionId } }),
  ]);

  return {
    responseCount,
    assessmentCount,
    deletable: responseCount === 0 && assessmentCount === 0,
  };
}

export type StoredLesson = {
  topicTitle: string;
  lesson: {
    title: string;
    blockCount: number;
    authored: boolean;
    updatedAt: string;
    /** The source markdown, but only for authored notes — never placeholders. */
    markdown: string | null;
  } | null;
};

/**
 * What is currently stored against a topic, so the upload form can show the
 * admin what they are about to replace. `null` means the topic id is unknown.
 */
export async function getStoredLesson(topicId: string): Promise<StoredLesson | null> {
  const topic = await db.topic.findUnique({
    where: { id: topicId },
    select: {
      title: true,
      // Canonical fragment: the upload form must be told about the same lesson
      // the Classroom renders and the import route overwrites.
      subtopics: topicLessonSelectWith({
        title: true,
        blocks: true,
        content: true,
        createdBy: true,
        updatedAt: true,
      }),
    },
  });
  if (!topic) return null;

  const lesson = resolveTopicLesson(topic);
  return {
    topicTitle: topic.title,
    lesson: lesson
      ? {
          title: lesson.title,
          blockCount: parseBlocks(lesson.blocks).length,
          authored: isAuthored(lesson.createdBy),
          updatedAt: lesson.updatedAt.toISOString(),
          markdown: isAuthored(lesson.createdBy) ? lesson.content : null,
        }
      : null,
  };
}
