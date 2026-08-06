// Recognisers for natural teacher's-markdown conventions — a document header,
// a numbered quiz, and worked examples. Each is gated on an explicit heading
// by the scanner in ./index.ts, and each falls back to prose rather than
// erroring when its inner shape does not match.
// See docs/superpowers/specs/2026-08-06-natural-lesson-note-format-design.md

import type { LessonBlock, CheckBlock, ConceptBlock } from "@/lib/lesson-engine";
import type { Issue } from "./types";
import { slugify } from "./ids";

/**
 * Strips the `<Subject> Lesson Note:` boilerplate teachers put in front of the
 * real title. Anchored and specific: a title containing a colon for any other
 * reason ("Osmosis: A Closer Look") keeps it.
 */
export function stripLessonNotePrefix(title: string): string {
  return title.replace(/^[A-Za-z][A-Za-z\s]*?\blesson\s+notes?\s*:\s*/i, "").trim() || title.trim();
}

/**
 * `**Class:** SSS1 | **Term:** First Term` → `{ Class: "SSS1", Term: "First Term" }`.
 *
 * Returns null unless EVERY `|`-separated segment is a `**Key:** value` pair.
 * That is what keeps an ordinary sentence containing one bold run — "This
 * lesson is **important** for WAEC." — from being swallowed as metadata.
 *
 * The colon must appear exactly once, in exactly one of two positions —
 * inside the bold run (`**Class:**`) or just outside it (`**Class**:`) —
 * never both and never neither. A bare bolded lead phrase with no colon at
 * all ("**Warning** please review carefully.") must NOT parse as metadata,
 * and a colon in both positions ("**Class:**: SSS1") must not sneak through
 * with a key that still ends in a colon.
 */
export function parseInfoLine(line: string): Record<string, string> | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("**")) return null;

  const segments = trimmed.split("|").map((s) => s.trim()).filter(Boolean);
  if (segments.length === 0) return null;

  const info: Record<string, string> = {};
  for (const segment of segments) {
    // Colon inside the bold run: "**Key:** value"
    // Colon outside the bold run: "**Key**: value"
    // The key charset excludes ":" so neither form can capture a colon into
    // the key itself.
    const match =
      /^\*\*([^*:]+):\*\*\s*(.*)$/.exec(segment) ??
      /^\*\*([^*:]+)\*\*:\s*(.*)$/.exec(segment);
    if (!match) return null;
    const key = match[1].trim();
    const value = match[2].trim();
    // A second, adjacent colon (e.g. "**Class:**: SSS1") lands here as a
    // value that still starts with ":" -- reject it rather than let it
    // through with a stray leading colon.
    if (!key || !value || value.startsWith(":")) return null;
    info[key] = value;
  }
  return info;
}

/** `---`, `***` or `___` alone on a line. */
export function isHorizontalRule(line: string): boolean {
  return /^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line);
}

export type SectionArgs = {
  /** Body lines *after* the heading, from the heading's next line onward. */
  lines: string[];
  /** 1-based source line number of `lines[0]`. */
  startLine: number;
  heading: string;
  nextId: (slug: string) => string;
  previousNonCheckId: string | null;
  errors: Issue[];
  warnings: Issue[];
};

export type SectionResult = { blocks: LessonBlock[]; consumed: number };

/** `## Quiz`, `## Quiz (10 Questions)`, `## Quiz Time`. */
export function isQuizHeading(title: string): boolean {
  return /^quiz\b/i.test(title.trim());
}

/**
 * Removes a correct-answer marker from the end of an option.
 *
 * Four glyphs plus a bare trailing `*` or `**`, because a marker that fails to
 * survive a copy-paste or an encoding round-trip would turn a good question
 * into a hard error. `marked` is false when no marker was present — trailing
 * whitespace alone never counts, since the marker group is not optional.
 *
 * The glyphs are unambiguous and always strip. A trailing asterisk run is
 * not: an option can legitimately *end* in bold or italic text ("...is
 * **key**"), and the closing delimiter of that span must not be misread as
 * the answer marker. The trailing run only counts as a marker when it does
 * NOT close a span opened earlier in the same option — i.e. when the text
 * before it contains an *even* number of same-length asterisk runs (zero,
 * most commonly: nothing earlier for it to pair with). An *odd* count means
 * one of those earlier runs is the opening half of a real emphasis span that
 * this trailing run closes, so it is markup, not a marker, and the text is
 * returned unchanged.
 */
export function stripAnswerMarker(text: string): { text: string; marked: boolean } {
  const glyphMatch = /\s*[✔✓✅☑]\s*$/u.exec(text);
  if (glyphMatch) {
    return { text: text.slice(0, glyphMatch.index).trim(), marked: true };
  }

  const starMatch = /\s*(\*{1,2})\s*$/.exec(text);
  if (!starMatch) return { text: text.trim(), marked: false };

  const run = starMatch[1];
  const rest = text.slice(0, starMatch.index);
  const sameLengthRuns =
    rest.match(new RegExp(`(?<!\\*)\\*{${run.length}}(?!\\*)`, "g")) ?? [];
  const closesEarlierSpan = sameLengthRuns.length % 2 === 1;
  if (closesEarlierSpan) return { text: text.trim(), marked: false };

  return { text: rest.trim(), marked: true };
}

/** A line that closes any natural section: a heading of level 1-2, or a fence. */
function isSectionTerminator(line: string): boolean {
  return /^#{1,2}\s/.test(line) || /^:::/.test(line.trim());
}

const SHORT_ANSWER_RE = /\*\((?:short answer|answer)\s*:\s*(.+)\)\*/i;

type RawQuestion = {
  label: string;
  line: number;
  stem: string[];
  options: Array<{ key: string; text: string[] }>;
};

export function parseQuizSection(args: SectionArgs): SectionResult {
  const { lines, startLine, heading, nextId, previousNonCheckId, errors } = args;

  let consumed = 0;
  while (consumed < lines.length && !isSectionTerminator(lines[consumed])) consumed += 1;
  const body = lines.slice(0, consumed);

  const preamble: string[] = [];
  const questions: RawQuestion[] = [];

  for (let i = 0; i < body.length; i++) {
    const raw = body[i];
    const lineNo = startLine + i;
    if (isHorizontalRule(raw)) continue;

    const question = /^\s*(\d+)[.)]\s+(.*)$/.exec(raw);
    if (question) {
      questions.push({
        label: question[1],
        line: lineNo,
        stem: [question[2].trim()],
        options: [],
      });
      continue;
    }

    const current = questions[questions.length - 1];
    const option = current ? /^\s*([A-Ha-h])[.)]\s+(.*)$/.exec(raw) : null;
    if (option && current) {
      current.options.push({ key: option[1].toUpperCase(), text: [option[2].trim()] });
      continue;
    }

    if (!raw.trim()) continue;

    // Unlabelled: continue whatever opened last, so wrapped questions and long
    // options work without ceremony — the same rule readFence() uses.
    if (!current) {
      preamble.push(raw.trim());
    } else if (current.options.length > 0) {
      current.options[current.options.length - 1].text.push(raw.trim());
    } else {
      current.stem.push(raw.trim());
    }
  }

  const blocks: LessonBlock[] = [];

  // Prose above the first question is a rubric, not decoration. Keep it.
  if (preamble.length > 0) {
    const rubric: ConceptBlock = {
      type: "concept",
      id: nextId(slugify(heading)),
      title: heading,
      text: preamble.join("\n"),
    };
    blocks.push(rubric);
  }

  // A check must follow a non-check block. Prefer a rubric card we just made,
  // else the last card before the quiz.
  let lastNonCheckId =
    blocks.length > 0 ? blocks[blocks.length - 1].id : previousNonCheckId;

  for (const question of questions) {
    const stem = question.stem.join(" ").trim();

    if (question.options.length === 0) {
      const shortAnswer = SHORT_ANSWER_RE.exec(stem);
      if (!shortAnswer) {
        errors.push({
          line: question.line,
          message: `Question ${question.label} has no options and no "(Short answer: …)".`,
        });
        continue;
      }
      const block: ConceptBlock = {
        type: "concept",
        id: nextId("short-answer"),
        text: stem.replace(SHORT_ANSWER_RE, "").trim(),
        reveal: shortAnswer[1].trim(),
      };
      blocks.push(block);
      lastNonCheckId = block.id;
      continue;
    }

    if (question.options.length < 2) {
      errors.push({
        line: question.line,
        message: `Question ${question.label} has only one option — a check needs at least two.`,
      });
      continue;
    }

    const seenKeys = new Set<string>();
    const duplicateKey = question.options.find((option) => {
      if (seenKeys.has(option.key)) return true;
      seenKeys.add(option.key);
      return false;
    })?.key;
    if (duplicateKey) {
      errors.push({
        line: question.line,
        message: `Question ${question.label} repeats option ${duplicateKey.toLowerCase()}) — each option needs its own letter.`,
      });
      continue;
    }

    const options: Record<string, string> = {};
    const marked: string[] = [];
    for (const option of question.options) {
      const { text, marked: isAnswer } = stripAnswerMarker(option.text.join(" ").trim());
      options[option.key] = text;
      if (isAnswer) marked.push(option.key);
    }

    if (marked.length === 0) {
      errors.push({
        line: question.line,
        message: `Question ${question.label} has no correct option — mark it with ✔.`,
      });
      continue;
    }
    if (marked.length > 1) {
      errors.push({
        line: question.line,
        message: `Question ${question.label} marks ${marked.length} correct options — a check needs exactly one.`,
      });
      continue;
    }
    if (!lastNonCheckId) {
      errors.push({
        line: question.line,
        message: `Question ${question.label} cannot be the lesson's first block — put the quiz after a card.`,
      });
      continue;
    }

    const check: CheckBlock = {
      type: "check",
      id: nextId("check"),
      question: stem,
      options,
      answer: marked[0],
      explanation: "",
      afterCard: lastNonCheckId,
    };
    blocks.push(check);
  }

  return { blocks, consumed };
}
