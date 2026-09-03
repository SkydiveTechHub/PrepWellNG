import type { ExamType, Prisma } from "@prisma/client";
import { db } from "./db";

export type QuestionFilter = {
  subjectId?: string | null;
  topicId?: string | null;
  examType?: string | null;
  examYear?: string | null;
  difficulty?: string | null;
};

function buildWhere(filter: QuestionFilter): Prisma.QuestionWhereInput {
  const where: Record<string, unknown> = {};
  if (filter.subjectId) where.subjectId = filter.subjectId;
  if (filter.topicId) where.topicId = filter.topicId;
  if (filter.examType) where.examType = filter.examType;
  if (filter.examYear) where.examYear = parseInt(filter.examYear);
  if (filter.difficulty) where.difficulty = filter.difficulty;
  return where;
}

/** One page of questions matching the filter, with its pagination envelope. */
export async function listQuestions(
  filter: QuestionFilter,
  page: number,
  limit: number,
) {
  const where = buildWhere(filter);

  const [questions, total] = await Promise.all([
    db.question.findMany({
      where,
      include: {
        subject: { select: { id: true, name: true, slug: true } },
        topic: { select: { id: true, title: true, slug: true } },
      },
      orderBy: [{ examYear: "desc" }, { questionNumber: "asc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    db.question.count({ where }),
  ]);

  return {
    questions,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export type PastPaper = {
  examType: string;
  examYear: number | null;
  subjectId: string;
  subjectName: string;
  subjectSlug: string;
  /** Lets the practice flow show a student their own track's subjects first. */
  trackCategory: string;
  /** Null when we have not fetched this paper yet. */
  questionCount: number | null;
  /** False for a paper the provider lists but we have never pulled. */
  cached: boolean;
};

/** Available past papers, grouped by exam type, year and subject. */
export async function listPastPapers(
  filter: Pick<QuestionFilter, "examType" | "subjectId">,
): Promise<PastPaper[]> {
  const papers = await db.question.groupBy({
    by: ["examType", "examYear", "subjectId"],
    where: { ...buildWhere(filter), examYear: { not: null } },
    _count: { id: true },
    orderBy: [{ examYear: "desc" }, { examType: "asc" }],
  });

  // Papers the provider lists but we have never pulled. Without them the
  // picker can only offer what we already hold, so a paper nobody has fetched
  // can never be selected — and therefore never gets fetched.
  const catalogue = await db.providerCatalogue.findMany({
    where: {
      ...(filter.examType ? { examType: filter.examType as ExamType } : {}),
      ...(filter.subjectId ? { subjectId: filter.subjectId } : {}),
    },
    select: { subjectId: true, examType: true, examYear: true },
  });

  const key = (subjectId: string, examType: string, examYear: number | null) =>
    `${subjectId}|${examType}|${examYear}`;
  const held = new Set(papers.map((p) => key(p.subjectId, p.examType, p.examYear)));
  const extra = catalogue.filter(
    (row) => !held.has(key(row.subjectId, row.examType, row.examYear)),
  );

  // Built from the union of both id sets — a catalogue-only subject would
  // otherwise render as "Unknown".
  const subjects = await db.subject.findMany({
    where: {
      id: {
        in: [
          ...new Set([
            ...papers.map((p) => p.subjectId),
            ...extra.map((row) => row.subjectId),
          ]),
        ],
      },
    },
    select: { id: true, name: true, slug: true, trackCategory: true },
  });
  const subjectById = new Map(subjects.map((s) => [s.id, s]));

  const describe = (
    subjectId: string,
    examType: string,
    examYear: number | null,
    questionCount: number | null,
  ): PastPaper => {
    const subject = subjectById.get(subjectId);
    return {
      examType,
      examYear,
      subjectId,
      subjectName: subject?.name ?? "Unknown",
      subjectSlug: subject?.slug ?? "",
      trackCategory: subject?.trackCategory ?? "CORE",
      questionCount,
      cached: questionCount !== null,
    };
  };

  return [
    ...papers.map((p) => describe(p.subjectId, p.examType, p.examYear, p._count.id)),
    ...extra.map((row) => describe(row.subjectId, row.examType, row.examYear, null)),
  ];
}
