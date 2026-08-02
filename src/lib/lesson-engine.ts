import type { PrismaClient } from "@prisma/client";
import type { MasteryLevel } from "@/types/prisma";

// Lesson Engine — block model, authoring lint, mastery math, and revision
// scheduling. See docs/superpowers/specs/2026-08-01-lesson-engine-design.md.

export const MAX_CARD_WORDS = 120;

export const EXAM_TYPES = ["WAEC", "JAMB", "NECO"] as const;
export type ExamTypeTag = (typeof EXAM_TYPES)[number];

export interface ConceptBlock {
  type: "concept";
  id: string;
  title?: string;
  text: string;
  reveal?: string;
}

export interface DiagramHotspot {
  id: string;
  label: string;
  text: string;
  x?: number;
  y?: number;
}

export interface DiagramBlock {
  type: "diagram";
  id: string;
  title?: string;
  caption?: string;
  svg: string;
  hotspots: DiagramHotspot[];
}

export type ExampleMode = "worked" | "partial" | "solo";

export interface ExampleBlock {
  type: "example";
  id: string;
  title?: string;
  problem: string;
  steps: string[];
  answer: string;
  mode?: ExampleMode;
}

export interface TipBlock {
  type: "tip";
  id: string;
  text: string;
  examType?: ExamTypeTag;
}

export interface MistakeBlock {
  type: "mistake";
  id: string;
  wrong: string;
  right: string;
}

export interface MnemonicBlock {
  type: "mnemonic";
  id: string;
  phrase: string;
  encoded: string[];
}

export interface CheckBlock {
  type: "check";
  id: string;
  question: string;
  options: Record<string, string>;
  answer: string;
  explanation: string;
  afterCard: string;
}

export type LessonBlock =
  | ConceptBlock
  | DiagramBlock
  | ExampleBlock
  | TipBlock
  | MistakeBlock
  | MnemonicBlock
  | CheckBlock;

export type LintIssue = { blockId?: string; message: string };

const BLOCK_TYPE_SET = new Set([
  "concept",
  "diagram",
  "example",
  "tip",
  "mistake",
  "mnemonic",
  "check",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

function isOptions(value: unknown): value is Record<string, string> {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  return keys.length >= 2 && keys.every((k) => typeof value[k] === "string");
}

/** Parses the `blocks` JSON column into a typed block list, dropping junk. */
export function parseBlocks(raw: unknown): LessonBlock[] {
  if (!Array.isArray(raw)) return [];
  const blocks: LessonBlock[] = [];
  for (const item of raw) {
    const block = parseBlock(item);
    if (block) blocks.push(block);
  }
  return blocks;
}

function parseBlock(raw: unknown): LessonBlock | null {
  if (!isRecord(raw)) return null;
  const type = raw.type;
  if (typeof type !== "string" || !BLOCK_TYPE_SET.has(type)) return null;
  const id = typeof raw.id === "string" ? raw.id : "";
  if (!id) return null;

  switch (type) {
    case "concept":
      if (typeof raw.text !== "string") return null;
      return {
        type: "concept",
        id,
        title: typeof raw.title === "string" ? raw.title : undefined,
        text: raw.text,
        reveal: typeof raw.reveal === "string" ? raw.reveal : undefined,
      };
    case "diagram": {
      const hotspots = Array.isArray(raw.hotspots)
        ? raw.hotspots.filter(isRecord).map((h) => ({
            id: typeof h.id === "string" ? h.id : "",
            label: typeof h.label === "string" ? h.label : "Part",
            text: typeof h.text === "string" ? h.text : "",
            x: typeof h.x === "number" ? h.x : undefined,
            y: typeof h.y === "number" ? h.y : undefined,
          }))
        : [];
      return {
        type: "diagram",
        id,
        title: typeof raw.title === "string" ? raw.title : undefined,
        caption: typeof raw.caption === "string" ? raw.caption : undefined,
        svg: typeof raw.svg === "string" ? raw.svg : "",
        hotspots,
      };
    }
    case "example": {
      const steps = isStringArray(raw.steps) ? raw.steps : [];
      return {
        type: "example",
        id,
        title: typeof raw.title === "string" ? raw.title : undefined,
        problem: typeof raw.problem === "string" ? raw.problem : "",
        steps,
        answer: typeof raw.answer === "string" ? raw.answer : "",
        mode:
          raw.mode === "worked" ||
          raw.mode === "partial" ||
          raw.mode === "solo"
            ? raw.mode
            : undefined,
      };
    }
    case "tip":
      return {
        type: "tip",
        id,
        text: typeof raw.text === "string" ? raw.text : "",
        examType:
          typeof raw.examType === "string" &&
          (EXAM_TYPES as readonly string[]).includes(raw.examType)
            ? (raw.examType as ExamTypeTag)
            : undefined,
      };
    case "mistake":
      return {
        type: "mistake",
        id,
        wrong: typeof raw.wrong === "string" ? raw.wrong : "",
        right: typeof raw.right === "string" ? raw.right : "",
      };
    case "mnemonic":
      return {
        type: "mnemonic",
        id,
        phrase: typeof raw.phrase === "string" ? raw.phrase : "",
        encoded: isStringArray(raw.encoded) ? raw.encoded : [],
      };
    case "check":
      if (typeof raw.question !== "string" || !isOptions(raw.options)) {
        return null;
      }
      return {
        type: "check",
        id,
        question: raw.question,
        options: raw.options,
        answer: typeof raw.answer === "string" ? raw.answer : "",
        explanation:
          typeof raw.explanation === "string" ? raw.explanation : "",
        afterCard: typeof raw.afterCard === "string" ? raw.afterCard : "",
      };
    default:
      return null;
  }
}

export function wordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

/** Primary prose length of a block, used by the card word-count lint. */
export function blockWordCount(block: LessonBlock): number {
  switch (block.type) {
    case "concept":
      return wordCount(block.text) + (block.reveal ? wordCount(block.reveal) : 0);
    case "diagram":
      return wordCount(block.caption ?? "");
    case "example":
      return (
        wordCount(block.problem) +
        block.steps.reduce((sum, s) => sum + wordCount(s), 0) +
        wordCount(block.answer)
      );
    case "tip":
      return wordCount(block.text);
    case "mistake":
      return wordCount(block.wrong) + wordCount(block.right);
    case "mnemonic":
      return wordCount(block.phrase) + block.encoded.reduce((s, e) => s + wordCount(e), 0);
    case "check":
      return wordCount(block.question);
  }
}

/**
 * Authoring lint. Returns human-readable issues; an empty array means the
 * lesson's blocks are valid. Run at seed/import time, not per request.
 */
export function lintLessonBlocks(blocks: LessonBlock[]): LintIssue[] {
  const issues: LintIssue[] = [];
  const seen = new Set<string>();
  const nonCheckIds = new Set<string>();

  if (blocks.length === 0) {
    issues.push({ message: "Lesson has no blocks." });
    return issues;
  }

  const first = blocks[0];
  if (first.type === "check") {
    issues.push({ blockId: first.id, message: "A lesson cannot start with a knowledge check." });
  }

  let hasConcept = false;
  let hasCheck = false;

  for (const block of blocks) {
    if (seen.has(block.id)) {
      issues.push({ blockId: block.id, message: `Duplicate block id "${block.id}".` });
    }
    seen.add(block.id);

    if (block.type === "concept") hasConcept = true;

    if (block.type !== "check") {
      nonCheckIds.add(block.id);
      const words = blockWordCount(block);
      if (words > MAX_CARD_WORDS) {
        issues.push({
          blockId: block.id,
          message: `"${block.id}" is ${words} words — cards must be ≤ ${MAX_CARD_WORDS}. Split it into two cards.`,
        });
      }
      continue;
    }

    hasCheck = true;
    if (!block.afterCard) {
      issues.push({
        blockId: block.id,
        message: `Check "${block.id}" must reference the card it follows via "afterCard".`,
      });
    } else if (!nonCheckIds.has(block.afterCard)) {
      issues.push({
        blockId: block.id,
        message: `Check "${block.id}" references unknown "afterCard" "${block.afterCard}".`,
      });
    }
    if (!block.answer) {
      issues.push({ blockId: block.id, message: `Check "${block.id}" has no correct answer.` });
    } else if (!Object.prototype.hasOwnProperty.call(block.options, block.answer)) {
      issues.push({
        blockId: block.id,
        message: `Check "${block.id}" answer "${block.answer}" is not one of its options.`,
      });
    }
  }

  if (!hasConcept) {
    issues.push({ message: "A lesson needs at least one concept card." });
  }
  if (!hasCheck) {
    issues.push({ message: "A lesson should include at least one knowledge check." });
  }

  return issues;
}

/** Deterministic objectives for the orient screen (phase 1 has no authored objectives field). */
export function deriveObjectives(
  topicTitle: string,
  subjectName: string,
): string[] {
  return [
    `Remember — list the key terms and definitions in ${topicTitle}.`,
    `Understand — explain ${topicTitle} in your own words.`,
    `Apply — solve WAEC, JAMB and NECO-style problems on ${topicTitle}.`,
    `Connect — link ${topicTitle} to the wider ${subjectName} syllabus.`,
  ];
}

/** Prereq labels from the `prerequisites` JSON column (informational). */
export function parsePrerequisiteLabels(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const labels: string[] = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const label = item.topicTitle ?? item.lessonTitle;
    if (typeof label === "string" && label.trim()) labels.push(label.trim());
  }
  return labels;
}

/** True when the student has completed at least one lesson under the topic. */
export async function hasCompletedAnyLessonInTopic(
  prisma: Pick<PrismaClient, "lesson" | "studentProgress">,
  studentId: string,
  topicId: string,
): Promise<boolean> {
  const lessons = await prisma.lesson.findMany({
    where: { subtopic: { topicId } },
    select: { id: true },
  });
  if (lessons.length === 0) return true;
  const count = await prisma.studentProgress.count({
    where: {
      studentId,
      topicId,
      lessonId: { in: lessons.map((l) => l.id) },
      status: "COMPLETED",
    },
  });
  return count > 0;
}

// ─── Checkpoint state (per-block progress) ────────────────────

export type CheckpointRecord = {
  attempts: number;
  correct: boolean;
};

export type PracticeRecord = {
  attemptId: string;
  percentage: number;
  passed: boolean;
  at: string;
};

/** What the engine stores in `StudentProgress.checkpointData`. */
export type CheckpointState = {
  visited: string[];
  checks: Record<string, CheckpointRecord>;
  practice?: PracticeRecord[];
};

function isCheckpointState(value: unknown): value is CheckpointState {
  return (
    isRecord(value) &&
    Array.isArray(value.visited) &&
    isRecord(value.checks)
  );
}

/** Parses stored `checkpointData` into a typed state, tolerating junk. */
export function parseCheckpointState(raw: unknown): CheckpointState {
  if (!isCheckpointState(raw)) {
    return { visited: [], checks: {} };
  }

  const visited = raw.visited.filter(
    (v): v is string => typeof v === "string",
  );

  const checks: Record<string, CheckpointRecord> = {};
  for (const [key, value] of Object.entries(raw.checks)) {
    if (!isRecord(value)) continue;
    checks[key] = {
      attempts:
        typeof value.attempts === "number" && value.attempts >= 1
          ? Math.floor(value.attempts)
          : 1,
      correct: typeof value.correct === "boolean" ? value.correct : false,
    };
  }

  const practice = Array.isArray(raw.practice)
    ? raw.practice
        .filter(isRecord)
        .map((p) => ({
          attemptId: typeof p.attemptId === "string" ? p.attemptId : "",
          percentage: typeof p.percentage === "number" ? p.percentage : 0,
          passed: typeof p.passed === "boolean" ? p.passed : false,
          at: typeof p.at === "string" ? p.at : "",
        }))
        .filter((p) => p.attemptId)
    : undefined;

  return { visited, checks, practice };
}

// ─── Mastery math ────────────────────────────────────────────

/**
 * Knowledge-check accuracy in 0..1. First-try correct = full credit,
 * correct after a retry = half credit, never correct = 0.
 */
export function kcAccuracyFromCheckpoints(
  checks: Record<string, CheckpointRecord>,
): number {
  const records = Object.values(checks);
  if (records.length === 0) return 0;
  let total = 0;
  for (const record of records) {
    if (!record.correct) continue;
    total += record.attempts === 1 ? 1 : 0.5;
  }
  return total / records.length;
}

/** Mastery score in 0..100 — 30% knowledge checks, 70% practice exit. */
export function computeMasteryScore(
  kcScore01: number,
  practiceScore01: number,
): number {
  const raw = 0.3 * kcScore01 + 0.7 * practiceScore01;
  return Math.min(100, Math.max(0, Math.round(raw * 100)));
}

/** Best of the most recent 3 scores — a bad retake never erases a pass. */
export function bestOfLastThree(scores: number[]): number {
  const recent = scores.slice(-3);
  return recent.reduce((best, score) => Math.max(best, score), 0);
}

const MASTERY_THRESHOLDS: Array<{ min: number; level: MasteryLevel }> = [
  { min: 85, level: "STRONG" },
  { min: 70, level: "COMPETENT" },
  { min: 50, level: "DEVELOPING" },
  { min: 0, level: "WEAK" },
];

export function masteryLevelFromScore(score: number): MasteryLevel {
  const threshold = MASTERY_THRESHOLDS.find((t) => score >= t.min);
  return threshold?.level ?? "WEAK";
}

// ─── Revision scheduling ─────────────────────────────────────

const DEFAULT_REVISION_DAYS = [1, 3, 7, 14];

export function parseRevisionDays(raw: unknown): number[] {
  if (!Array.isArray(raw)) return DEFAULT_REVISION_DAYS;
  const days = raw.filter(
    (d): d is number =>
      typeof d === "number" && Number.isInteger(d) && d >= 1,
  );
  return days.length > 0 ? days : DEFAULT_REVISION_DAYS;
}

/** The first scheduled revision date after a lesson is completed. */
export function nextRevisionDate(from: Date, revisionDays: unknown): Date {
  const [first = 1] = parseRevisionDays(revisionDays);
  const next = new Date(from);
  next.setDate(next.getDate() + first);
  next.setHours(0, 0, 0, 0);
  return next;
}
