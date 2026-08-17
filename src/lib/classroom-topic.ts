import { db } from "./db";
import {
  computeTopicReadiness,
  loadPretestPassed,
  type PrereqStatus,
} from "@/engines/learning/availability";
import type { TopicState } from "@/engines/learning/mastery";
import {
  deriveObjectives,
  parseBlocks,
  parsePrerequisiteLabels,
  type CheckBlock,
  type LessonBlock,
} from "./lesson-engine";
import { computeLessonAccess } from "@/engines/learning/availability";
import {
  resolveTopicLesson,
  topicLessonSelect,
  topicNeighbours,
  type TopicNavItem,
} from "./classroom";
import type { ClassLevel, Term } from "./curriculum-scope";

/** Matches the `ResourceItem` shape `TopicResources` renders. */
export type TopicResourceItem = {
  id: string;
  title: string;
  url: string;
  resourceType: string;
  description: string | null;
};

export type TopicPageData = {
  subject: { id: string; name: string; code: string };
  topic: {
    id: string;
    title: string;
    estimatedMinutes: number;
    waecWeight: number;
    jambWeight: number;
    questionCount: number;
    classLevel: ClassLevel;
    term: Term;
  };
  /**
   * Every topic has exactly one lesson (150/150 in the live database), but this
   * is modelled defensively — a topic somehow missing one renders the page
   * without notes or the action bar rather than crashing.
   */
  lesson: {
    id: string;
    blocks: LessonBlock[];
    fallbackContent: string | null;
  } | null;
  deckId: string | null;
  pretestCertified: boolean;
  topicReady: boolean;
  prereqs: PrereqStatus[];
  topicState: TopicState | null;
  previous: TopicNavItem | null;
  next: TopicNavItem | null;
  lessonResources: TopicResourceItem[];
  subjectResources: TopicResourceItem[];
};

/**
 * Everything the topic detail page renders, or `null` when the subject or topic
 * does not exist — the caller decides what a miss means (the page 404s).
 */
export async function getTopicPageData(
  userId: string,
  subjectSlug: string,
  topicSlug: string,
): Promise<TopicPageData | null> {
  const subject = await db.subject.findUnique({
    where: { slug: subjectSlug },
    select: { id: true, name: true, code: true },
  });
  if (!subject) return null;

  const topic = await db.topic.findUnique({
    where: { subjectId_slug: { subjectId: subject.id, slug: topicSlug } },
    include: {
      curriculumLevel: true,
      subtopics: topicLessonSelect,
      _count: { select: { questions: true } },
    },
  });
  if (!topic) return null;

  const lesson = resolveTopicLesson(topic);

  // Everything below only depends on `subject`/`topic`/`lesson`, already in
  // hand, so it's fetched in parallel rather than as sequential awaits.
  const [pretestPassed, deck, siblingTopics, lessonResourceRows] = await Promise.all([
    // Learning Path Engine — graph-derived availability (algorithm B). The old
    // "any lesson completed under the prereq" gate is superseded by composite
    // mastery over every PREREQUISITE edge. A readiness pretest (≥80% on 5
    // questions) self-certifies a topic and satisfies its incoming gates.
    loadPretestPassed(db, userId, subject.id),
    lesson
      ? db.flashcardDeck.findUnique({
          where: { lessonId_source: { lessonId: lesson.id, source: "LESSON" } },
          select: { id: true },
        })
      : Promise.resolve(null),
    // Sibling topics across the subject, for previous/next navigation within
    // the current class level.
    db.topic.findMany({
      where: { subjectId: subject.id },
      select: {
        slug: true,
        title: true,
        orderIndex: true,
        curriculumLevel: { select: { classLevel: true, term: true } },
      },
    }),
    // Topic-specific resources — every lesson has its own row set (possibly
    // empty; the subject fallback only kicks in when it is).
    lesson
      ? db.lessonResource.findMany({
          where: { lessonId: lesson.id },
          orderBy: { orderIndex: "asc" },
        })
      : Promise.resolve([]),
  ]);

  const { ready, state, prereqs } = await computeTopicReadiness({
    prisma: db,
    studentId: userId,
    subjectId: subject.id,
    topicId: topic.id,
    pretestPassed,
  });

  const navItems: TopicNavItem[] = siblingTopics.map((t) => ({
    slug: t.slug,
    title: t.title,
    classLevel: t.curriculumLevel.classLevel,
    term: t.curriculumLevel.term,
    orderIndex: t.orderIndex,
  }));
  const { previous, next } = topicNeighbours(navItems, topicSlug);

  const lessonResources: TopicResourceItem[] = lessonResourceRows.map((r) => ({
    id: r.id,
    // `caption` is nullable free text, not a title — fall back to a generic
    // label by resource type rather than rendering an empty heading.
    title:
      r.caption ??
      `${r.resourceType.charAt(0).toUpperCase()}${r.resourceType.slice(1)} resource`,
    url: r.url,
    resourceType: r.resourceType,
    description: null,
  }));

  // Loading all 43 subject resources to discard them would be waste — only
  // fetch the fallback when the topic actually has no resources of its own.
  const subjectResourceRows =
    lessonResources.length === 0
      ? await db.subjectResource.findMany({
          where: { subjectId: subject.id },
          orderBy: { orderIndex: "asc" },
        })
      : [];

  return {
    subject,
    topic: {
      id: topic.id,
      title: topic.title,
      estimatedMinutes: topic.estimatedMinutes,
      waecWeight: topic.waecWeight,
      jambWeight: topic.jambWeight,
      questionCount: topic._count.questions,
      classLevel: topic.curriculumLevel.classLevel,
      term: topic.curriculumLevel.term,
    },
    lesson: lesson
      ? {
          id: lesson.id,
          blocks: parseBlocks(lesson.blocks),
          fallbackContent: lesson.content,
        }
      : null,
    deckId: deck?.id ?? null,
    pretestCertified: pretestPassed.has(topic.id),
    topicReady: ready,
    prereqs,
    topicState: state.get(topic.id) ?? null,
    previous,
    next,
    lessonResources,
    subjectResources: subjectResourceRows.map((r) => ({
      id: r.id,
      title: r.title,
      url: r.url,
      resourceType: r.resourceType,
      description: r.description,
    })),
  };
}

/**
 * Resolves a subject + topic pair to the topic's single lesson.
 *
 * `null` means the subject or topic slug does not exist; a `lesson: null`
 * result means the topic exists but has no lesson, which callers treat as a
 * redirect back to the topic page rather than a 404.
 */
async function loadTopicLesson(subjectSlug: string, topicSlug: string) {
  const subject = await db.subject.findUnique({
    where: { slug: subjectSlug },
    select: { id: true, name: true },
  });
  if (!subject) return null;

  const topic = await db.topic.findUnique({
    where: { subjectId_slug: { subjectId: subject.id, slug: topicSlug } },
    select: { id: true, title: true, subtopics: topicLessonSelect },
  });
  if (!topic) return null;

  return { subject, topic, lesson: resolveTopicLesson(topic) };
}

export type TopicQuizData = {
  /** Authored knowledge checks from the lesson note; empty means fall back. */
  checks: CheckBlock[];
  lessonTitle: string;
};

/**
 * The quick quiz serves the lesson note's own questions when it has any, and
 * the caller falls back to the WAEC/JAMB bank when `checks` is empty.
 *
 * The fallback is load-bearing, not defensive padding: the seeded corpus is 150
 * machine-generated lessons with no authored knowledge checks, so without it
 * this page would be empty for nearly every topic in the database today.
 */
export async function getTopicQuizData(
  subjectSlug: string,
  topicSlug: string,
): Promise<TopicQuizData | null> {
  const found = await loadTopicLesson(subjectSlug, topicSlug);
  if (!found) return null;

  const { topic, lesson } = found;
  return {
    checks: lesson
      ? parseBlocks(lesson.blocks).filter((b): b is CheckBlock => b.type === "check")
      : [],
    lessonTitle: lesson?.title ?? topic.title,
  };
}

export type TopicPracticeData = {
  lessonTitle: string;
  topicTitle: string;
  passMarkPercent: number;
  practiceCount: number;
};

/**
 * Practice is deliberately NOT gated on having studied the lesson. The gate
 * used to be `completionPercent === 0`, which unlocked after a single card — so
 * the UI promised a prerequisite it never really enforced. Rather than tighten
 * it, the product decision was to drop it.
 */
export async function getTopicPracticeData(
  subjectSlug: string,
  topicSlug: string,
): Promise<TopicPracticeData | null | "no-lesson"> {
  const found = await loadTopicLesson(subjectSlug, topicSlug);
  if (!found) return null;
  if (!found.lesson) return "no-lesson";

  return {
    lessonTitle: found.lesson.title,
    topicTitle: found.topic.title,
    passMarkPercent: found.lesson.passMarkPercent,
    practiceCount: found.lesson.practiceCount,
  };
}

export type TopicStudyData = {
  subjectName: string;
  topicTitle: string;
  lessonId: string;
  lessonTitle: string;
  blocks: LessonBlock[];
  objectives: string[];
  estimatedMinutes: number;
  difficulty: string;
  prerequisiteLabels: string[];
  locked: boolean;
  lockedReason: string | null;
  passMarkPercent: number;
  practiceCount: number;
  legacy: { content: string; keyPoints: string[]; summary: string | null };
};

export async function getTopicStudyData(
  userId: string,
  subjectSlug: string,
  topicSlug: string,
): Promise<TopicStudyData | null | "no-lesson"> {
  const found = await loadTopicLesson(subjectSlug, topicSlug);
  if (!found) return null;
  const { subject, topic, lesson } = found;
  if (!lesson) return "no-lesson";

  // Learning Path Engine — graph-derived per-lesson unlock (algorithm B).
  // A lesson opens when its topic's PREREQUISITE gates are met, the authoring
  // prerequisites are satisfied, and earlier lessons in the subtopic are done.
  const { lessonReady, prereqs } = await computeLessonAccess(
    db,
    userId,
    subject.id,
    topic.id,
    lesson.id,
  );
  const locked = !lessonReady;
  const unmetPrereqs = prereqs.filter((prereq) => !prereq.met);

  const prerequisiteLabels = parsePrerequisiteLabels(lesson.prerequisites);
  for (const prereq of unmetPrereqs) {
    prerequisiteLabels.push(
      `Master ${prereq.title} (${prereq.need}% mastery) to unlock`,
    );
  }

  return {
    subjectName: subject.name,
    topicTitle: topic.title,
    lessonId: lesson.id,
    lessonTitle: lesson.title,
    blocks: parseBlocks(lesson.blocks),
    objectives: deriveObjectives(topic.title, subject.name),
    estimatedMinutes: lesson.estimatedMinutes,
    difficulty: lesson.difficulty,
    prerequisiteLabels,
    locked,
    lockedReason: locked
      ? unmetPrereqs.length > 0
        ? `"${topic.title}" builds on ${unmetPrereqs
            .map((p) => `"${p.title}" (${p.need}% mastery)`)
            .join(" and ")}. Reach those milestones, then return to unlock this lesson.`
        : `Finish the earlier lessons in this topic, then return to unlock this one.`
      : null,
    passMarkPercent: lesson.passMarkPercent,
    practiceCount: lesson.practiceCount,
    legacy: {
      content: lesson.content,
      keyPoints: Array.isArray(lesson.keyPoints) ? (lesson.keyPoints as string[]) : [],
      summary: lesson.summary,
    },
  };
}
