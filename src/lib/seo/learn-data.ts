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

/**
 * Options is a Json column; a row with no parsed options cannot be rendered
 * as a sample, so it must not count toward eligibility either. This is the
 * one place that rule lives — loadEligibleTopics() and loadPublicTopic() both
 * call it (as does paper-data.ts's loadPaper/loadEligiblePaperParams), so the
 * prerendered/sitemapped set and the non-404 set can never drift apart.
 */
export function keepRenderable<T extends { options: unknown }>(
  questions: T[],
): (T & { options: Record<string, string> })[] {
  return questions.flatMap((q) => {
    const options = q.options as Record<string, string> | null;
    if (!options || Object.keys(options).length === 0) return [];
    return [{ ...q, options }];
  });
}

export type PublicTopic = {
  subject: { slug: string; name: string };
  slug: string;
  title: string;
  description: string | null;
  waecWeight: number;
  jambWeight: number;
  subtopics: { title: string; description: string | null }[];
  prerequisites: {
    slug: string;
    title: string;
    rationale: string | null;
    subjectSlug: string;
  }[];
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
            prereqTopic: {
              select: {
                id: true,
                slug: true,
                title: true,
                subject: { select: { slug: true } },
              },
            },
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

    const renderable = keepRenderable(questions);

    if (
      !isTopicPageEligible({
        description: topic.description,
        subtopicCount: topic.subtopics.length,
        publicQuestionCount: renderable.length,
      })
    ) {
      return null;
    }

    // Prerequisites and siblings must be filtered to the same eligible set
    // the hub filters against, or a page that survived the gate would still
    // link out to one that 404s.
    const eligibleIds = await loadEligibleTopicIds();

    const siblingCandidates = await db.topic.findMany({
      where: { subjectId: topic.subject.id, id: { not: topic.id } },
      orderBy: { orderIndex: "asc" },
      select: { id: true, slug: true, title: true },
    });
    const siblings = siblingCandidates
      .filter((sibling) => eligibleIds.has(sibling.id))
      .slice(0, 8)
      .map(({ slug, title }) => ({ slug, title }));

    const prerequisites = topic.prereqEdges
      .filter((edge) => eligibleIds.has(edge.prereqTopic.id))
      .map((edge) => ({
        slug: edge.prereqTopic.slug,
        title: edge.prereqTopic.title,
        rationale: edge.rationale,
        // The prereq's own subject, not the current topic's — prereqEdges may
        // span subjects (207 TopicEdge rows today are all same-subject, but
        // that's incidental, not guaranteed), so the href must not assume the
        // current topic's subject slug.
        subjectSlug: edge.prereqTopic.subject.slug,
      }));

    return {
      subject: { slug: topic.subject.slug, name: topic.subject.name },
      slug: topic.slug,
      title: topic.title,
      description: topic.description,
      waecWeight: topic.waecWeight,
      jambWeight: topic.jambWeight,
      subtopics: topic.subtopics,
      prerequisites,
      siblings,
      questionCount: renderable.length,
      samples: pickSamples(renderable, TOPIC_SAMPLE_COUNT, topic.id),
    };
  },
);

type EligibleTopic = {
  id: string;
  subjectSlug: string;
  topicSlug: string;
  lastModified: Date | null;
};

/**
 * The one query that decides which topics get a page at all: prerendered by
 * generateStaticParams, listed in the sitemap, linkable from a hub or
 * another topic's siblings/prerequisites, and NOT notFound()'d at request
 * time. Every other loader in this module that needs "is this topic
 * eligible" derives from this one, so those four things can never drift
 * apart from each other.
 *
 * Eligibility requires the same options-parseability check loadPublicTopic
 * applies to its own questions (via keepRenderable) — a topic whose public
 * questions all have empty/unparseable `options` has nothing renderable and
 * must not count as eligible here either, or generateStaticParams would
 * prerender (and the sitemap would list) a page that then 404s.
 *
 * lastModified is the newest *renderable* question in the topic. Topic has
 * no updatedAt column, so when a topic has no dated renderable question the
 * field stays null and the sitemap omits it — `new Date()` would claim every
 * page changed on every build, which teaches crawlers to ignore the signal.
 */
const loadEligibleTopics = cache(async (): Promise<EligibleTopic[]> => {
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
        select: { createdAt: true, options: true },
      },
    },
  });

  return topics
    .map((topic) => ({ topic, renderable: keepRenderable(topic.questions) }))
    .filter(({ topic, renderable }) =>
      isTopicPageEligible({
        description: topic.description,
        subtopicCount: topic._count.subtopics,
        publicQuestionCount: renderable.length,
      }),
    )
    .map(({ topic, renderable }) => ({
      id: topic.id,
      subjectSlug: topic.subject.slug,
      topicSlug: topic.slug,
      lastModified: renderable[0]?.createdAt ?? null,
    }));
});

/** Params for generateStaticParams and for the sitemap. */
export const loadEligibleTopicParams = cache(async () => {
  const topics = await loadEligibleTopics();
  return topics.map(({ subjectSlug, topicSlug, lastModified }) => ({
    subjectSlug,
    topicSlug,
    lastModified,
  }));
});

/** Slugs whose topic pages actually exist, so hubs never link into a 404. */
export const loadEligibleTopicSlugs = cache(
  async (subjectSlug: string): Promise<Set<string>> => {
    const topics = await loadEligibleTopics();
    return new Set(
      topics
        .filter((topic) => topic.subjectSlug === subjectSlug)
        .map((topic) => topic.topicSlug),
    );
  },
);

/**
 * Ids whose topic pages actually exist, for filtering a topic's own
 * siblings and prerequisites (which may span subjects) so a page that
 * survived the gate never links to one that didn't.
 */
export const loadEligibleTopicIds = cache(async (): Promise<Set<string>> => {
  const topics = await loadEligibleTopics();
  return new Set(topics.map((topic) => topic.id));
});
