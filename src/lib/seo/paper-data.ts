import { cache } from "react";
import { db } from "@/lib/db";
import { PAPER_SAMPLE_COUNT, isPaperPageEligible } from "./eligibility";
import { examSegmentFor, type PublicExamType } from "./exam-segment";
import type { PublicSampleQuestion } from "./learn-data";
import { publicQuestionWhere } from "./question-scope";
import { pickSamples } from "./samples";

/**
 * Rows the public pages may draw from: objective, non-provider questions that
 * carry a year. A question with no examYear belongs to no paper.
 */
const withYear = { examYear: { not: null } } as const;

export const loadExamSubjects = cache(async (examType: PublicExamType) => {
  const rows = await db.question.groupBy({
    by: ["subjectId"],
    where: publicQuestionWhere({ examType, ...withYear }),
    _count: { _all: true },
  });

  const subjects = await db.subject.findMany({
    where: { id: { in: rows.map((row) => row.subjectId) } },
    orderBy: { name: "asc" },
    select: { id: true, slug: true, name: true },
  });

  const counts = new Map(rows.map((row) => [row.subjectId, row._count._all]));
  return subjects.map((subject) => ({
    slug: subject.slug,
    name: subject.name,
    questionCount: counts.get(subject.id) ?? 0,
  }));
});

export const loadPaperYears = cache(
  async (examType: PublicExamType, subjectSlug: string) => {
    const subject = await db.subject.findUnique({
      where: { slug: subjectSlug },
      select: { id: true, name: true },
    });
    if (!subject) return null;

    const rows = await db.question.groupBy({
      by: ["examYear"],
      where: publicQuestionWhere({ examType, subjectId: subject.id, ...withYear }),
      _count: { _all: true },
      orderBy: { examYear: "desc" },
    });

    return {
      subject,
      // Only years that clear the gate — listing a year whose page 404s is a
      // crawl trap and wastes the crawl budget on this section.
      years: rows
        .filter((row) => isPaperPageEligible({ publicQuestionCount: row._count._all }))
        .map((row) => ({ year: row.examYear as number, questionCount: row._count._all })),
    };
  },
);

export type PublicPaper = {
  examType: PublicExamType;
  year: number;
  subject: { slug: string; name: string };
  questionCount: number;
  topics: { slug: string | null; title: string; questionCount: number }[];
  samples: PublicSampleQuestion[];
  adjacentYears: { previous: number | null; next: number | null };
  lastModified: Date | null;
};

export const loadPaper = cache(
  async (
    examType: PublicExamType,
    subjectSlug: string,
    year: number,
  ): Promise<PublicPaper | null> => {
    const subject = await db.subject.findUnique({
      where: { slug: subjectSlug },
      select: { id: true, slug: true, name: true },
    });
    if (!subject) return null;

    const questions = await db.question.findMany({
      where: publicQuestionWhere({ examType, subjectId: subject.id, examYear: year }),
      select: {
        id: true, questionText: true, options: true, correctAnswer: true,
        explanation: true, createdAt: true,
        topic: { select: { slug: true, title: true } },
      },
    });

    const renderable = questions.flatMap((q) => {
      const options = q.options as Record<string, string> | null;
      if (!options || Object.keys(options).length === 0) return [];
      return [{ ...q, options }];
    });

    if (!isPaperPageEligible({ publicQuestionCount: renderable.length })) return null;

    const byTopic = new Map<string, { slug: string | null; title: string; questionCount: number }>();
    for (const question of renderable) {
      const title = question.topic?.title ?? "General";
      const existing = byTopic.get(title);
      if (existing) existing.questionCount += 1;
      else
        byTopic.set(title, {
          slug: question.topic?.slug ?? null,
          title,
          questionCount: 1,
        });
    }

    const otherYears = await db.question.groupBy({
      by: ["examYear"],
      where: publicQuestionWhere({ examType, subjectId: subject.id, ...withYear }),
      _count: { _all: true },
    });
    const eligibleYears = otherYears
      .filter((row) => isPaperPageEligible({ publicQuestionCount: row._count._all }))
      .map((row) => row.examYear as number)
      .sort((a, b) => a - b);

    const index = eligibleYears.indexOf(year);
    const newest = renderable.reduce<Date | null>(
      (latest, q) => (!latest || q.createdAt > latest ? q.createdAt : latest),
      null,
    );

    return {
      examType,
      year,
      subject: { slug: subject.slug, name: subject.name },
      questionCount: renderable.length,
      topics: [...byTopic.values()].sort((a, b) => b.questionCount - a.questionCount),
      samples: pickSamples(
        renderable,
        PAPER_SAMPLE_COUNT,
        `${examType}:${subject.id}:${year}`,
      ),
      adjacentYears: {
        previous: index > 0 ? eligibleYears[index - 1] : null,
        next: index >= 0 && index < eligibleYears.length - 1 ? eligibleYears[index + 1] : null,
      },
      lastModified: newest,
    };
  },
);

/** One query for both generateStaticParams and the sitemap. */
export const loadEligiblePaperParams = cache(async () => {
  const rows = await db.question.groupBy({
    by: ["examType", "subjectId", "examYear"],
    where: publicQuestionWhere(withYear),
    _count: { _all: true },
    _max: { createdAt: true },
  });

  const subjects = await db.subject.findMany({ select: { id: true, slug: true } });
  const slugById = new Map(subjects.map((subject) => [subject.id, subject.slug]));

  return rows.flatMap((row) => {
    if (!isPaperPageEligible({ publicQuestionCount: row._count._all })) return [];

    const examSegment = examSegmentFor(row.examType);
    const subjectSlug = slugById.get(row.subjectId);
    // CUSTOM has no public route, and a question pointing at a deleted subject
    // has no URL to live at.
    if (!examSegment || !subjectSlug || row.examYear === null) return [];

    return [{
      examSegment,
      subjectSlug,
      year: row.examYear,
      lastModified: row._max.createdAt ?? null,
    }];
  });
});
