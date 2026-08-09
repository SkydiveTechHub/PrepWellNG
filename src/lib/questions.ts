import type { Prisma } from "@prisma/client";
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
  questionCount: number;
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

  const subjects = await db.subject.findMany({
    where: { id: { in: [...new Set(papers.map((p) => p.subjectId))] } },
    select: { id: true, name: true, slug: true, trackCategory: true },
  });
  const subjectById = new Map(subjects.map((s) => [s.id, s]));

  return papers.map((p) => {
    const subject = subjectById.get(p.subjectId);
    return {
      examType: p.examType,
      examYear: p.examYear,
      subjectId: p.subjectId,
      subjectName: subject?.name ?? "Unknown",
      subjectSlug: subject?.slug ?? "",
      trackCategory: subject?.trackCategory ?? "CORE",
      questionCount: p._count.id,
    };
  });
}
