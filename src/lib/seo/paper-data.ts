import { cache } from "react";
import { db } from "@/lib/db";
import { PAPER_SAMPLE_COUNT, isPaperPageEligible } from "./eligibility";
import { examSegmentFor, type PublicExamType } from "./exam-segment";
import { keepRenderable, loadEligibleTopicIds, type PublicSampleQuestion } from "./learn-data";
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
        topic: { select: { id: true, slug: true, title: true } },
      },
    });

    const renderable = keepRenderable(questions);

    if (!isPaperPageEligible({ publicQuestionCount: renderable.length })) return null;

    // Every row a topic breakdown links out to must itself be a publishable
    // topic page (loadEligibleTopicIds — the same source /learn filters
    // against), or the majority of rows across the 47 papers link to a 404.
    // A row for an ineligible topic still appears, so the counts keep summing
    // to the paper's real question count; it just renders with slug: null,
    // i.e. as plain text instead of a link.
    const eligibleTopicIds = await loadEligibleTopicIds();

    const byTopic = new Map<string, { slug: string | null; title: string; questionCount: number }>();
    for (const question of renderable) {
      const title = question.topic?.title ?? "General";
      const isEligible = question.topic ? eligibleTopicIds.has(question.topic.id) : false;
      const existing = byTopic.get(title);
      if (existing) {
        existing.questionCount += 1;
        if (isEligible && !existing.slug) existing.slug = question.topic!.slug;
      } else {
        byTopic.set(title, {
          slug: isEligible ? (question.topic?.slug ?? null) : null,
          title,
          questionCount: 1,
        });
      }
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

type PaperBucket = {
  examType: string;
  subjectId: string;
  examYear: number;
  count: number;
  lastModified: Date | null;
};

/**
 * One query for both generateStaticParams and the sitemap — and the same
 * predicate loadPaper uses, mirroring how learn-data.ts's loadEligibleTopics
 * is the one query loadPublicTopic's own eligibility check derives from.
 *
 * A Prisma `groupBy` `_count._all` cannot apply the options-parseability
 * filter (that lives in JS, via keepRenderable), so counting with groupBy
 * here previously let a paper with >=10 questions but <10 *renderable* ones
 * get prerendered and sitemapped, then 404 at request time. Fetching the raw
 * rows and grouping in JS — one query, not N+1 — keeps this provably the same
 * predicate as loadPaper's `renderable.length`.
 */
export const loadEligiblePaperParams = cache(async () => {
  const rows = await db.question.findMany({
    where: publicQuestionWhere(withYear),
    select: { examType: true, subjectId: true, examYear: true, options: true, createdAt: true },
  });

  const renderable = keepRenderable(rows);

  const buckets = new Map<string, PaperBucket>();
  for (const row of renderable) {
    if (row.examYear === null) continue;
    const key = JSON.stringify([row.examType, row.subjectId, row.examYear]);
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.count += 1;
      if (!bucket.lastModified || row.createdAt > bucket.lastModified) {
        bucket.lastModified = row.createdAt;
      }
    } else {
      buckets.set(key, {
        examType: row.examType,
        subjectId: row.subjectId,
        examYear: row.examYear,
        count: 1,
        lastModified: row.createdAt,
      });
    }
  }

  const subjects = await db.subject.findMany({ select: { id: true, slug: true } });
  const slugById = new Map(subjects.map((subject) => [subject.id, subject.slug]));

  return [...buckets.values()].flatMap((bucket) => {
    if (!isPaperPageEligible({ publicQuestionCount: bucket.count })) return [];

    const examSegment = examSegmentFor(bucket.examType);
    const subjectSlug = slugById.get(bucket.subjectId);
    // CUSTOM has no public route, and a question pointing at a deleted subject
    // has no URL to live at.
    if (!examSegment || !subjectSlug) return [];

    return [{
      examSegment,
      subjectSlug,
      year: bucket.examYear,
      lastModified: bucket.lastModified,
    }];
  });
});
