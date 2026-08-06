import type { LessonBlock, ConceptBlock } from "@/lib/lesson-engine";
import { MAX_CARD_WORDS, blockWordCount, lintLessonBlocks, wordCount } from "@/lib/lesson-engine";
import type { Issue, LessonMeta, ParsedLesson } from "./types";
import { makeIdFactory, slugify } from "./ids";
import { parseFrontmatter } from "./frontmatter";
import { FENCE_TYPES, buildFenceBlock, readFence, type FenceType } from "./fences";

// Pure markdown → LessonBlock[] parser for admin lesson-note upload.
// See docs/superpowers/specs/2026-08-05-lesson-note-upload-design.md.
//
// Deliberately has no Prisma, React or next/* imports: it runs both in the
// browser (upload preview) and in a route handler (the authoritative parse).

/** A heading section, before it is turned into one or more concept blocks. */
type Section = { title?: string; text: string; reveal?: string; line: number };

/**
 * Emits a section as one concept card, or several split at paragraph
 * boundaries when it exceeds MAX_CARD_WORDS. The heading rides the first
 * card; the notes view renders consecutive concepts as continuous prose, so
 * a split is invisible there and only shapes the card player.
 */
function emitConcept(
  section: Section,
  nextId: (slug: string) => string,
  blocks: LessonBlock[],
  warnings: Issue[],
): void {
  const slug = slugify(section.title ?? "concept");
  const whole: ConceptBlock = {
    type: "concept",
    id: nextId(slug),
    title: section.title,
    text: section.text,
    reveal: section.reveal || undefined,
  };

  if (blockWordCount(whole) <= MAX_CARD_WORDS) {
    blocks.push(whole);
    return;
  }

  const paragraphs = section.text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  if (paragraphs.length < 2) {
    // Nothing to split on. Keep it whole — the lint will reject it, which is
    // the honest outcome: splitting mid-sentence would be worse.
    blocks.push(whole);
    return;
  }

  const cards: string[] = [];
  let current: string[] = [];
  let running = 0;
  for (const paragraph of paragraphs) {
    const words = wordCount(paragraph);
    if (current.length > 0 && running + words > MAX_CARD_WORDS) {
      cards.push(current.join("\n\n"));
      current = [];
      running = 0;
    }
    current.push(paragraph);
    running += words;
  }
  if (current.length > 0) cards.push(current.join("\n\n"));

  // The id minted for `whole` is already claimed; reuse it for the first card.
  const emitted: ConceptBlock[] = cards.map((text, index) => ({
    type: "concept",
    id: index === 0 ? whole.id : nextId(slug),
    title: index === 0 ? section.title : undefined,
    text,
    // The reveal belongs with the last card, where the idea completes.
    reveal: index === cards.length - 1 ? section.reveal || undefined : undefined,
  }));
  blocks.push(...emitted);

  // The budget above counts paragraph words only, so the card carrying the
  // reveal can land over the cap even though the split "succeeded". That is
  // deliberate — folding the reveal into `running` would silently move the
  // split points of every existing draft — and it fails closed, because the
  // lint rejects the over-cap card. What was wrong was the *report*: a
  // success-toned warning sat beside an error naming a synthetic card id the
  // author never wrote. Say it here instead, where the author's own heading is
  // named.
  const stillOver = emitted.some((block) => blockWordCount(block) > MAX_CARD_WORDS);
  warnings.push({
    line: section.line,
    message:
      `"${section.title ?? "Untitled section"}" is longer than ${MAX_CARD_WORDS} words and was split into ${cards.length} cards` +
      (stillOver ? " — one is still over the limit, see the errors below." : "."),
  });
}

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
    emitConcept(section, nextId, blocks, warnings);
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

    const fenceOpen = /^:::\s*([a-z]+)\s*$/i.exec(line.trim());
    if (fenceOpen) {
      flush();
      const type = fenceOpen[1].toLowerCase();
      const closeOffset = front.bodyLines
        .slice(i + 1)
        .findIndex((l) => l.trim() === ":::");
      if (closeOffset === -1) {
        errors.push({ line: lineNo, message: `Fence ":::${type}" was never closed.` });
        break;
      }
      const body = front.bodyLines.slice(i + 1, i + 1 + closeOffset);
      i += closeOffset + 1; // skip past the closing :::

      if (!(FENCE_TYPES as readonly string[]).includes(type)) {
        errors.push({ line: lineNo, message: `Unknown fence type ":::${type}".` });
        continue;
      }

      const fields = readFence(body, lineNo, errors);
      const previousNonCheckId =
        [...blocks].reverse().find((b) => b.type !== "check")?.id ?? null;
      const block = buildFenceBlock(type as FenceType, fields, {
        id: nextId(type),
        openLine: lineNo,
        previousNonCheckId,
        warnings,
        errors,
      });
      if (block) blocks.push(block);
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

/**
 * Parse plus the lesson-engine authoring lint. This is what the admin form
 * and the import route call — the parser owns syntax, the lint owns pedagogy
 * (card length, at least one concept, at least one check, afterCard targets).
 */
export function validateLessonMarkdown(source: string): ParsedLesson {
  const parsed = parseLessonMarkdown(source);
  if (parsed.blocks.length === 0) return parsed;
  const lintIssues = lintLessonBlocks(parsed.blocks).map((issue) => ({
    message: issue.blockId ? `${issue.blockId}: ${issue.message}` : issue.message,
  }));
  return { ...parsed, errors: [...parsed.errors, ...lintIssues] };
}

export { slugify } from "./ids";
export { sanitizeSvg } from "./svg-sanitiser";
export type {
  Issue,
  LessonDifficulty,
  LessonMeta,
  ParsedLesson,
} from "./types";
