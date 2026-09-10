import { cache } from "react";
import { db } from "@/lib/db";
import { PAPER_SAMPLE_COUNT, isPaperPageEligible } from "./eligibility";
import { examSegmentFor, type PublicExamType } from "./exam-segment";
import { loadEligibleTopicIds, type PublicSampleQuestion } from "./learn-data";
import { keepRenderable, publicQuestionWhere } from "./question-scope";
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

    // Derived from loadEligiblePaperParams(), not a fresh groupBy — a groupBy
    // count cannot apply keepRenderable's options-parseability filter, so a
    // year with >=10 public questions but <10 *renderable* ones would list
    // here (and 404 when followed) even though loadPaper itself would refuse
    // to render it. One shared eligible-year source for both.
    const examSegment = examSegmentFor(examType);
    const eligibleParams = await loadEligiblePaperParams();

    return {
      subject,
      years: eligibleParams
        .filter((p) => p.examSegment === examSegment && p.subjectSlug === subjectSlug)
        .map((p) => ({ year: p.year, questionCount: p.questionCount }))
        .sort((a, b) => b.year - a.year),
    };
  },
);

export type PublicPaper = {
  examType: PublicExamType;
  year: number;
  subject: { slug: string; name: string };
  questionCount: number;
  topics: { slug: string | null; subjectSlug: string | null; title: string; questionCount: number }[];
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
        // subject.slug, not the paper's own subject.slug: Question.subjectId
        // and Question.topicId are independent foreign keys (nothing enforces
        // a question's topic belongs to its subject), so the href must not
        // assume the paper's subject — same fix as the prereq path in
        // learn-data.ts's loadPublicTopic.
        topic: { select: { id: true, slug: true, title: true, subject: { select: { slug: true } } } },
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

    const byTopic = new Map<
      string,
      { slug: string | null; subjectSlug: string | null; title: string; questionCount: number }
    >();
    for (const question of renderable) {
      const title = question.topic?.title ?? "General";
      const isEligible = question.topic ? eligibleTopicIds.has(question.topic.id) : false;
      const existing = byTopic.get(title);
      if (existing) {
        existing.questionCount += 1;
        if (isEligible && !existing.slug) {
          existing.slug = question.topic!.slug;
          existing.subjectSlug = question.topic!.subject.slug;
        }
      } else {
        byTopic.set(title, {
          slug: isEligible ? (question.topic?.slug ?? null) : null,
          subjectSlug: isEligible ? (question.topic?.subject.slug ?? null) : null,
          title,
          questionCount: 1,
        });
      }
    }

    // Same shared source as loadPaperYears, and for the same reason: a
    // groupBy count here previously admitted a neighbour year with >=10
    // public but <10 renderable questions into the prev/next links, which
    // then 404'd when followed.
    const examSegment = examSegmentFor(examType);
    const eligiblePaperParams = await loadEligiblePaperParams();
    const eligibleYears = eligiblePaperParams
      .filter((p) => p.examSegment === examSegment && p.subjectSlug === subjectSlug)
      .map((p) => p.year)
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
 * The one query every paper-eligibility decision derives from: prerendered by
 * generateStaticParams, listed in the sitemap, offered as a year link from
 * `/past-questions/[exam]/[subjectSlug]`, offered as a prev/next link from a
 * neighbouring paper (loadPaperYears and loadPaper's own adjacentYears both
 * read this instead of running their own groupBy), and NOT notFound()'d at
 * request time. Mirrors how learn-data.ts's loadEligibleTopics is the one
 * query loadPublicTopic's own eligibility check derives from.
 *
 * A Prisma `groupBy` `_count._all` cannot apply the options-parseability
 * filter (that lives in JS, via keepRenderable), so counting with groupBy
 * here previously let a paper with >=10 questions but <10 *renderable* ones
 * get prerendered and sitemapped, then 404 at request time — and, separately,
 * let loadPaperYears and loadPaper list and link to that same over-counted
 * year before both were switched to read this query too. Fetching the raw
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
      questionCount: bucket.count,
      lastModified: bucket.lastModified,
    }];
  });
});
