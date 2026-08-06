import type { LessonBlock } from "@/lib/lesson-engine";
import type { LessonDifficulty, ParsedLesson } from "@/lib/lesson-markdown";

// Shapes a parsed markdown lesson into a Prisma update payload. Pure — kept
// out of the route handler so it can be tested without a database.

/** What seedLessons() writes to Lesson.createdBy (src/lib/lessons.ts:205). */
export const SYSTEM_AUTHOR = "system";

export type LessonUpdateData = {
  blocks: LessonBlock[];
  content: string;
  createdBy: string;
  title?: string;
  summary?: string;
  estimatedMinutes?: number;
  difficulty?: LessonDifficulty;
  passMarkPercent?: number;
  practiceCount?: number;
};

/** A lesson is authored once an upload has stamped a real admin id on it. */
export function isAuthored(createdBy: string | null): boolean {
  return Boolean(createdBy) && createdBy !== SYSTEM_AUTHOR;
}

export function buildLessonUpdate(
  parsed: ParsedLesson,
  markdown: string,
  adminId: string,
): LessonUpdateData {
  const { meta } = parsed;
  const update: LessonUpdateData = {
    blocks: parsed.blocks,
    content: markdown,
    createdBy: adminId,
  };

  // Only keys the author actually supplied are written — an omitted key must
  // leave the lesson's current value alone, not overwrite it with a default.
  if (meta.title !== undefined) update.title = meta.title;
  if (meta.summary !== undefined) update.summary = meta.summary;
  if (meta.estimatedMinutes !== undefined) update.estimatedMinutes = meta.estimatedMinutes;
  if (meta.difficulty !== undefined) update.difficulty = meta.difficulty;
  if (meta.passMarkPercent !== undefined) update.passMarkPercent = meta.passMarkPercent;
  if (meta.practiceCount !== undefined) update.practiceCount = meta.practiceCount;

  // meta.subject and meta.topic are routing hints for bulk upload. They
  // deliberately never reach the database.
  return update;
}
