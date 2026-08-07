import { CLASS_LEVELS, TERMS, type ClassLevel, type Term } from "@/lib/curriculum-scope";
import { TRACK_CATEGORIES, TRACK_LABELS, type TrackCategory } from "@/lib/subjects";

// Narrowing the admin lesson list to one subject's topics. Pure — no Prisma, no
// React — so the filtering rules can be tested without a database or a browser.
//
// See docs/superpowers/specs/2026-08-06-admin-lessons-browse-design.md

export interface LessonFilter {
  track: TrackCategory | null;
  subjectId: string | null;
  classLevel: ClassLevel | null;
  term: Term | null;
}

export interface RawFilterParams {
  track?: string;
  subject?: string;
  class?: string;
  term?: string;
}

function memberOf<T extends string>(
  values: readonly T[],
  value: string | undefined,
): T | null {
  return value && (values as readonly string[]).includes(value) ? (value as T) : null;
}

/**
 * Coerce raw query strings into a filter that is safe to hand to Prisma.
 *
 * A hand-edited URL can carry anything, so an unrecognised track, class level
 * or term is dropped rather than passed through as a `where` clause on an enum
 * column, which would throw. Class and term are dropped when no subject is
 * selected: they only ever narrow within a subject, and keeping them would let
 * a stale value survive a subject change.
 */
export function normaliseFilter(params: RawFilterParams): LessonFilter {
  const subjectId = params.subject?.trim() ? params.subject : null;
  return {
    track: memberOf(TRACK_CATEGORIES, params.track),
    subjectId,
    classLevel: subjectId ? memberOf(CLASS_LEVELS, params.class) : null,
    term: subjectId ? memberOf(TERMS, params.term) : null,
  };
}

export interface SubjectOption {
  id: string;
  name: string;
  trackCategory: string;
}

export interface TrackOption {
  value: TrackCategory;
  label: string;
}

/**
 * The track options worth showing: a category with no subjects seeded would
 * otherwise be a dead end. Ordered by category so the list is stable whatever
 * order the subjects arrive in.
 */
export function tracksWithSubjects(subjects: readonly SubjectOption[]): TrackOption[] {
  const present = new Set(subjects.map((s) => s.trackCategory));
  return TRACK_CATEGORIES.filter((track) => present.has(track)).map((track) => ({
    value: track,
    label: TRACK_LABELS[track],
  }));
}

/**
 * Subjects in one track.
 *
 * Deliberately *not* `relevantTrackCategories()`: that expands a student's
 * track to CORE + track, because every candidate sits English and Mathematics.
 * An admin is looking for where a subject lives, and one subject appearing
 * under four tracks makes that harder. Here each subject has exactly one home.
 */
export function subjectsForTrack<T extends SubjectOption>(
  subjects: readonly T[],
  track: TrackCategory | null,
): T[] {
  if (!track) return [...subjects];
  return subjects.filter((subject) => subject.trackCategory === track);
}

export interface LevelBearing {
  classLevel: string;
  term: string;
}

/**
 * Which class levels and terms the selected subject actually teaches.
 *
 * Terms are scoped to the selected class: a subject can run a third-term SS1
 * topic and no third-term SS2 one, so offering "3rd term" against SS2 would
 * lead to an empty table.
 */
export function levelsPresent(
  topics: readonly LevelBearing[],
  classLevel: ClassLevel | null,
): { classLevels: ClassLevel[]; terms: Term[] } {
  const classes = new Set(topics.map((t) => t.classLevel));
  const inClass = classLevel ? topics.filter((t) => t.classLevel === classLevel) : topics;
  const terms = new Set(inClass.map((t) => t.term));
  return {
    classLevels: CLASS_LEVELS.filter((level) => classes.has(level)),
    terms: TERMS.filter((term) => terms.has(term)),
  };
}

export interface ClassSection<T extends { classLevel: string }> {
  classLevel: ClassLevel;
  rows: T[];
}

/**
 * Group topic rows into class sections for the "all classes" view.
 *
 * Sections come out in SS1–SS3 order; rows keep the order they arrived in, so
 * the query's `term` then `orderIndex` sort is preserved.
 */
export function groupByClass<T extends { classLevel: string }>(
  rows: readonly T[],
): ClassSection<T>[] {
  return CLASS_LEVELS.map((classLevel) => ({
    classLevel,
    rows: rows.filter((row) => row.classLevel === classLevel),
  })).filter((section) => section.rows.length > 0);
}
