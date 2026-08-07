import type { LessonBlock } from "@/lib/lesson-engine";

export type Issue = { line?: number; message: string };

export type LessonDifficulty = "BASIC" | "INTERMEDIATE" | "ADVANCED";

export const DIFFICULTIES: readonly LessonDifficulty[] = [
  "BASIC",
  "INTERMEDIATE",
  "ADVANCED",
];

export type LessonMeta = {
  title?: string;
  summary?: string;
  subject?: string;
  topic?: string;
  estimatedMinutes?: number;
  difficulty?: LessonDifficulty;
  passMarkPercent?: number;
  practiceCount?: number;
  /**
   * `**Class:** SSS1 | **Term:** First Term` captured from under the H1.
   * Displayed in the upload preview so the admin can confirm which note they
   * are uploading. Written to no column — none exists, and adding one needs
   * the migration that is still blocked.
   */
  docInfo?: Record<string, string>;
};

export type ParsedLesson = {
  meta: LessonMeta;
  blocks: LessonBlock[];
  warnings: Issue[];
  errors: Issue[];
};

export const TEXT_KEYS = ["title", "summary", "subject", "topic"] as const;
export const NUMBER_KEYS = [
  "estimatedMinutes",
  "passMarkPercent",
  "practiceCount",
] as const;
