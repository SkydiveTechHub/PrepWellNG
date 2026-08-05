import type { LessonBlock, ConceptBlock } from "@/lib/lesson-engine";

// Pure markdown → LessonBlock[] parser for admin lesson-note upload.
// See docs/superpowers/specs/2026-08-05-lesson-note-upload-design.md.
//
// Deliberately has no Prisma, React or next/* imports: it runs both in the
// browser (upload preview) and in a route handler (the authoritative parse).

export type Issue = { line?: number; message: string };

export type LessonDifficulty = "BASIC" | "INTERMEDIATE" | "ADVANCED";

const DIFFICULTIES: readonly LessonDifficulty[] = [
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
};

export type ParsedLesson = {
  meta: LessonMeta;
  blocks: LessonBlock[];
  warnings: Issue[];
  errors: Issue[];
};

const TEXT_KEYS = ["title", "summary", "subject", "topic"] as const;
const NUMBER_KEYS = [
  "estimatedMinutes",
  "passMarkPercent",
  "practiceCount",
] as const;

export function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "block"
  );
}

/** Mints ids as `<slug>-<n>`, bumping n until the id is unused. */
function makeIdFactory() {
  const used = new Set<string>();
  return function nextId(slug: string): string {
    let n = 1;
    let id = `${slug}-${n}`;
    while (used.has(id)) {
      n += 1;
      id = `${slug}-${n}`;
    }
    used.add(id);
    return id;
  };
}

type Frontmatter = {
  meta: LessonMeta;
  bodyLines: string[];
  bodyOffset: number;
  warnings: Issue[];
  errors: Issue[];
};

function parseFrontmatter(lines: string[]): Frontmatter {
  const meta: LessonMeta = {};
  const warnings: Issue[] = [];
  const errors: Issue[] = [];

  if (lines[0]?.trim() !== "---") {
    return { meta, bodyLines: lines, bodyOffset: 0, warnings, errors };
  }

  const close = lines.findIndex((line, i) => i > 0 && line.trim() === "---");
  if (close === -1) {
    errors.push({ line: 1, message: "Frontmatter opened with --- but never closed." });
    return { meta, bodyLines: lines, bodyOffset: 0, warnings, errors };
  }

  for (let i = 1; i < close; i++) {
    const raw = lines[i];
    if (!raw.trim()) continue;
    const sep = raw.indexOf(":");
    if (sep === -1) {
      errors.push({ line: i + 1, message: `Frontmatter line "${raw.trim()}" is not "key: value".` });
      continue;
    }
    const key = raw.slice(0, sep).trim();
    const value = raw.slice(sep + 1).trim();

    if ((TEXT_KEYS as readonly string[]).includes(key)) {
      meta[key as (typeof TEXT_KEYS)[number]] = value;
      continue;
    }
    if ((NUMBER_KEYS as readonly string[]).includes(key)) {
      const num = Number(value);
      if (!Number.isFinite(num) || num <= 0) {
        errors.push({ line: i + 1, message: `${key} must be a positive number, got "${value}".` });
        continue;
      }
      meta[key as (typeof NUMBER_KEYS)[number]] = Math.round(num);
      continue;
    }
    if (key === "difficulty") {
      if (!(DIFFICULTIES as readonly string[]).includes(value)) {
        errors.push({
          line: i + 1,
          message: `difficulty must be one of ${DIFFICULTIES.join(", ")}, got "${value}".`,
        });
        continue;
      }
      meta.difficulty = value as LessonDifficulty;
      continue;
    }
    warnings.push({ line: i + 1, message: `Unknown frontmatter key "${key}" — ignored.` });
  }

  return {
    meta,
    bodyLines: lines.slice(close + 1),
    bodyOffset: close + 1,
    warnings,
    errors,
  };
}

/** A heading section, before it is turned into one or more concept blocks. */
type Section = { title?: string; text: string; reveal?: string; line: number };

export function parseLessonMarkdown(source: string): ParsedLesson {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const front = parseFrontmatter(lines);
  const warnings = [...front.warnings];
  const errors = [...front.errors];
  const meta = { ...front.meta };

  const nextId = makeIdFactory();
  const blocks: LessonBlock[] = [];

  let section: Section | null = null;
  let buffer: string[] = [];
  let inReveal = false;

  function flush() {
    if (!section) {
      buffer = [];
      inReveal = false;
      return;
    }
    const text = buffer.join("\n").trim();
    if (inReveal) section.reveal = text;
    else section.text = text;
    buffer = [];

    if (!section.text) {
      section = null;
      inReveal = false;
      return;
    }
    const block: ConceptBlock = {
      type: "concept",
      id: nextId(slugify(section.title ?? "concept")),
      title: section.title,
      text: section.text,
      reveal: section.reveal || undefined,
    };
    blocks.push(block);
    section = null;
    inReveal = false;
  }

  for (let i = 0; i < front.bodyLines.length; i++) {
    const line = front.bodyLines[i];
    const lineNo = front.bodyOffset + i + 1;

    const h1 = /^#\s+(.*)$/.exec(line);
    if (h1) {
      flush();
      if (!meta.title) meta.title = h1[1].trim();
      continue;
    }

    const h2 = /^##\s+(.*)$/.exec(line);
    if (h2) {
      flush();
      section = { title: h2[1].trim(), text: "", line: lineNo };
      continue;
    }

    const h3 = /^###\s+(.*)$/.exec(line);
    if (h3) {
      if (section && /^reveal$/i.test(h3[1].trim())) {
        section.text = buffer.join("\n").trim();
        buffer = [];
        inReveal = true;
        continue;
      }
      // Any other h3 is prose inside the section, not a new block.
      buffer.push(line);
      continue;
    }

    if (!section && line.trim()) {
      // Prose before any heading still deserves a card.
      section = { title: undefined, text: "", line: lineNo };
    }
    buffer.push(line);
  }
  flush();

  if (blocks.length === 0 && errors.length === 0) {
    errors.push({ message: "This file has no lesson content." });
  }

  return { meta, blocks, warnings, errors };
}
