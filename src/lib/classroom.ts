import type { CheckBlock, LessonBlock } from "@/lib/lesson-engine";
import {
  CLASS_LEVELS,
  scopeOrdinal,
  type ClassLevel,
  type ScopePoint,
} from "@/lib/curriculum-scope";

// Decision logic for the Classroom section. Pure — no database, no React — so
// the rules that decide what a student sees can be tested directly.

/** Everything a note renders. `check` belongs to the player, not the note. */
export type NotesBlock = Exclude<LessonBlock, CheckBlock>;

/**
 * The lesson as a continuous note.
 *
 * Knowledge checks are dropped: a note is read, not answered, and a check
 * rendered here would grade nothing and record nothing.
 */
export function toNotes(blocks: readonly LessonBlock[]): NotesBlock[] {
  return blocks.filter((block): block is NotesBlock => block.type !== "check");
}

/**
 * Which class tab to open on.
 *
 * The student's own class when it has topics — an SS2 student should reach SS2
 * Physics in zero taps. Otherwise the lowest class that has any, so the page
 * never opens on an empty tab.
 */
export function resolveClassLevel(
  preferred: string | null | undefined,
  classesWithTopics: readonly string[],
): ClassLevel {
  const available = CLASS_LEVELS.filter((level) =>
    classesWithTopics.includes(level),
  );
  if (preferred && available.includes(preferred as ClassLevel)) {
    return preferred as ClassLevel;
  }
  return available[0] ?? "SS1";
}

export type TopicNavItem = {
  slug: string;
  title: string;
  classLevel: string;
  term: string;
  orderIndex: number;
};

/**
 * Prisma select fragment for a topic's `subtopics` relation, shaped to reach
 * "the topic's single lesson" — every topic has exactly one subtopic and one
 * lesson (150/150 in the live database). Spread this into every query that
 * needs to resolve that lesson, so the "exactly one" assumption is encoded in
 * one place rather than copy-pasted at each call site.
 *
 * `as const` keeps `orderBy`'s direction literals (`"asc"`) instead of
 * widening to `string`, which Prisma's generated types require.
 */
export const topicLessonSelect = {
  orderBy: { orderIndex: "asc" },
  take: 1,
  select: {
    lessons: { orderBy: { createdAt: "asc" }, take: 1 },
  },
} as const;

/**
 * The topic's single lesson, or `null` if it somehow has none (defensive —
 * every authored topic has one). Pairs with `topicLessonSelect`: callers query
 * `subtopics: topicLessonSelect` then pass the result here.
 */
export function resolveTopicLesson<Lesson>(topic: {
  subtopics: readonly { lessons: readonly Lesson[] }[];
}): Lesson | null {
  return topic.subtopics[0]?.lessons[0] ?? null;
}

/**
 * Previous and next topic, within the same class.
 *
 * Ordering runs term-by-term then by `orderIndex`, so navigation carries across
 * a term boundary but stops at a class boundary — moving from SS1 straight into
 * SS2 would silently skip a year.
 */
export function topicNeighbours(
  topics: readonly TopicNavItem[],
  currentSlug: string,
): { previous: TopicNavItem | null; next: TopicNavItem | null } {
  const current = topics.find((t) => t.slug === currentSlug);
  if (!current) return { previous: null, next: null };

  const ordered = topics
    .filter((t) => t.classLevel === current.classLevel)
    .sort((a, b) => {
      const byTerm =
        scopeOrdinal({ classLevel: a.classLevel, term: a.term } as ScopePoint) -
        scopeOrdinal({ classLevel: b.classLevel, term: b.term } as ScopePoint);
      return byTerm !== 0 ? byTerm : a.orderIndex - b.orderIndex;
    });

  const index = ordered.findIndex((t) => t.slug === currentSlug);
  return {
    previous: index > 0 ? ordered[index - 1] : null,
    next: index >= 0 && index < ordered.length - 1 ? ordered[index + 1] : null,
  };
}

/**
 * Which resources the topic page shows.
 *
 * Topic-specific resources win. Falling back to the subject's is better than an
 * empty section, but the caller must label it honestly — the `source` field is
 * what lets it say "More Physics resources" rather than implying these belong
 * to this topic.
 */
/**
 * Deep link from a subject's Classroom page into the scoped mock exam picker,
 * covering the whole of the selected class year.
 *
 * Lives here, shared by both sides of the server/client boundary, for two
 * reasons. First, a server component cannot hand a client component a function
 * — React cannot serialise one across that boundary — so the client builds the
 * URL itself from a plain `subjectId`. Second, these parameter names are a
 * contract with the picker's deep-link parser, and keeping the builder next to
 * its tests is what stops the two drifting apart.
 */
export function mockExamHrefFor({
  subjectId,
  classLevel,
}: {
  subjectId: string;
  classLevel: ClassLevel;
}): string {
  const params = new URLSearchParams({
    subjectId,
    fromClass: classLevel,
    fromTerm: "FIRST",
    toClass: classLevel,
    toTerm: "THIRD",
  });
  return `/practice/mock-exam?${params.toString()}`;
}

export function selectResources<T>(
  lessonResources: readonly T[],
  subjectResources: readonly T[],
): { items: T[]; source: "topic" | "subject" | "none" } {
  if (lessonResources.length > 0) {
    return { items: [...lessonResources], source: "topic" };
  }
  if (subjectResources.length > 0) {
    return { items: [...subjectResources], source: "subject" };
  }
  return { items: [], source: "none" };
}
