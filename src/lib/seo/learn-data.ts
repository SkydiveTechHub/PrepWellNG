import { cache } from "react";
import { db } from "@/lib/db";
import { TOPIC_SAMPLE_COUNT, isTopicPageEligible } from "./eligibility";
import { publicQuestionWhere } from "./question-scope";
import { pickSamples } from "./samples";

/**
 * Every loader is cache()-wrapped so generateMetadata and the page body share
 * one database round trip instead of issuing the same query twice.
 */

export type PublicSubject = {
  slug: string;
  name: string;
  description: string;
  trackCategory: string;
  isWaec: boolean;
  isJamb: boolean;
  isNeco: boolean;
};

export const loadPublicSubjects = cache(async (): Promise<PublicSubject[]> => {
  const subjects = await db.subject.findMany({
    orderBy: { name: "asc" },
    select: {
      slug: true, name: true, description: true, trackCategory: true,
      isWaec: true, isJamb: true, isNeco: true,
    },
  });
  return subjects;
});

/**
 * Subjects worth publishing a hub page for: those with at least one eligible
 * topic. Derived from loadEligibleTopicParams() rather than a second,
 * independently-drifting eligibility rule — of the 44 subjects in the
 * database, most have zero eligible topics and would otherwise publish as
 * hub pages that link nowhere.
 */
export const loadPublishableSubjects = cache(async (): Promise<PublicSubject[]> => {
  const [subjects, eligibleTopics] = await Promise.all([
    loadPublicSubjects(),
    loadEligibleTopicParams(),
  ]);
  const publishableSlugs = new Set(eligibleTopics.map((t) => t.subjectSlug));
  return subjects.filter((subject) => publishableSlugs.has(subject.slug));
});

export type PublicSubjectDetail = PublicSubject & {
  topics: { slug: string; title: string; description: string | null }[];
};

export const loadPublicSubject = cache(
  async (slug: string): Promise<PublicSubjectDetail | null> => {
    const subject = await db.subject.findUnique({
      where: { slug },
      select: {
        slug: true, name: true, description: true, trackCategory: true,
        isWaec: true, isJamb: true, isNeco: true,
        topics: {
          orderBy: { orderIndex: "asc" },
          select: { slug: true, title: true, description: true },
        },
      },
    });
    return subject;
  },
);

export type PublicSampleQuestion = {
  id: string;
  questionText: string;
  options: Record<string, string>;
  correctAnswer: string;
  explanation: string;
};

export type PublicTopic = {
  subject: { slug: string; name: string };
  slug: string;
  title: string;
  description: string | null;
  waecWeight: number;
  jambWeight: number;
  subtopics: { title: string; description: string | null }[];
  prerequisites: { slug: string; title: string; rationale: string | null }[];
  siblings: { slug: string; title: string }[];
  questionCount: number;
  samples: PublicSampleQuestion[];
};

export const loadPublicTopic = cache(
  async (subjectSlug: string, topicSlug: string): Promise<PublicTopic | null> => {
    const topic = await db.topic.findFirst({
      where: { slug: topicSlug, subject: { slug: subjectSlug } },
      select: {
        id: true, slug: true, title: true, description: true,
        waecWeight: true, jambWeight: true,
        subject: { select: { id: true, slug: true, name: true } },
        subtopics: {
          orderBy: { orderIndex: "asc" },
          select: { title: true, description: true },
        },
        prereqEdges: {
          select: {
            rationale: true,
            prereqTopic: { select: { slug: true, title: true } },
          },
        },
      },
    });
    if (!topic) return null;

    const questions = await db.question.findMany({
      where: publicQuestionWhere({ topicId: topic.id }),
      select: {
        id: true, questionText: true, options: true,
        correctAnswer: true, explanation: true,
      },
    });

    // Options is a Json column; a row with no parsed options cannot be
    // rendered as a sample, so it must not count toward eligibility either.
    const renderable = questions.flatMap((q) => {
      const options = q.options as Record<string, string> | null;
      if (!options || Object.keys(options).length === 0) return [];
      return [{ ...q, options }];
    });

    if (
      !isTopicPageEligible({
        description: topic.description,
        subtopicCount: topic.subtopics.length,
        publicQuestionCount: renderable.length,
      })
    ) {
      return null;
    }

    const siblings = await db.topic.findMany({
      where: { subjectId: topic.subject.id, id: { not: topic.id } },
      orderBy: { orderIndex: "asc" },
      take: 8,
      select: { slug: true, title: true },
    });

    return {
      subject: { slug: topic.subject.slug, name: topic.subject.name },
      slug: topic.slug,
      title: topic.title,
      description: topic.description,
      waecWeight: topic.waecWeight,
      jambWeight: topic.jambWeight,
      subtopics: topic.subtopics,
      prerequisites: topic.prereqEdges.map((edge) => ({
        slug: edge.prereqTopic.slug,
        title: edge.prereqTopic.title,
        rationale: edge.rationale,
      })),
      siblings,
      questionCount: renderable.length,
      samples: pickSamples(renderable, TOPIC_SAMPLE_COUNT, topic.id),
    };
  },
);

/**
 * Params for generateStaticParams and for the sitemap, from one query, so a
 * prerendered page and a sitemapped URL are always the same set.
 *
 * lastModified is the newest question in the topic. Topic has no updatedAt
 * column, so when a topic has no dated question the field stays null and the
 * sitemap omits it — `new Date()` would claim every page changed on every
 * build, which teaches crawlers to ignore the signal.
 */
export const loadEligibleTopicParams = cache(async () => {
  const topics = await db.topic.findMany({
    orderBy: [{ subject: { slug: "asc" } }, { orderIndex: "asc" }],
    select: {
      id: true,
      slug: true,
      description: true,
      subject: { select: { slug: true } },
      _count: { select: { subtopics: true } },
      questions: {
        where: publicQuestionWhere(),
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      },
    },
  });

  return topics
    .filter((topic) =>
      isTopicPageEligible({
        description: topic.description,
        subtopicCount: topic._count.subtopics,
        publicQuestionCount: topic.questions.length,
      }),
    )
    .map((topic) => ({
      subjectSlug: topic.subject.slug,
      topicSlug: topic.slug,
      lastModified: topic.questions[0]?.createdAt ?? null,
    }));
});

/** Slugs whose topic pages actually exist, so hubs never link into a 404. */
export const loadEligibleTopicSlugs = cache(
  async (subjectSlug: string): Promise<Set<string>> => {
    const params = await loadEligibleTopicParams();
    return new Set(
      params
        .filter((param) => param.subjectSlug === subjectSlug)
        .map((param) => param.topicSlug),
    );
  },
);
