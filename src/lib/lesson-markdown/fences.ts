import {
  EXAM_TYPES,
  type ExampleBlock,
  type TipBlock,
  type MistakeBlock,
  type MnemonicBlock,
  type CheckBlock,
  type ExamTypeTag,
  type ExampleMode,
  type DiagramBlock,
  type DiagramHotspot,
  type LessonBlock,
} from "@/lib/lesson-engine";
import type { Issue } from "./types";
import { slugify } from "./ids";
import { sanitizeSvg } from "./svg-sanitiser";

export const FENCE_TYPES = [
  "example",
  "tip",
  "mistake",
  "mnemonic",
  "check",
  "diagram",
] as const;
export type FenceType = (typeof FENCE_TYPES)[number];

/** One `Label: value` group inside a fence, in document order. */
type FenceFields = {
  singles: Map<string, string>;
  steps: string[];
  encoded: string[];
  hotspots: string[];
  options: Map<string, string>;
  prose: string[];
  raw: string[];
};

const SINGLE_LABELS = new Set([
  "problem", "answer", "mode", "title", "exam", "wrong", "right",
  "phrase", "q", "correct", "why", "after", "caption",
]);

/**
 * Short scalar fields that never wrap onto a second line. Without this, the
 * prose line after `Exam: WAEC` in a tip fence would be appended to the exam
 * tag instead of becoming the tip's text.
 */
const SCALAR_LABELS = new Set(["exam", "mode", "correct", "after"]);

/**
 * Splits a fence body into labelled fields. An unlabelled line appends to
 * whichever field was opened last, so authors can wrap prose naturally.
 */
export function readFence(
  body: string[],
  openLine: number,
  errors: Issue[],
): FenceFields {
  const fields: FenceFields = {
    singles: new Map(),
    steps: [],
    encoded: [],
    hotspots: [],
    options: new Map(),
    prose: [],
    raw: body,
  };
  let last: { kind: "single" | "step" | "encoded" | "hotspot" | "option" | "prose"; key: string } =
    { kind: "prose", key: "" };

  body.forEach((line, i) => {
    const lineNo = openLine + i + 1;
    const option = /^([A-H])\)\s?(.*)$/.exec(line);
    if (option) {
      const [, letter, value] = option;
      if (fields.options.has(letter)) {
        errors.push({ line: lineNo, message: `Option ${letter}) appears twice in this check.` });
      }
      fields.options.set(letter, value.trim());
      last = { kind: "option", key: letter };
      return;
    }

    const labelled = /^([A-Za-z]+):\s?(.*)$/.exec(line);
    if (labelled) {
      const key = labelled[1].toLowerCase();
      const value = labelled[2].trim();
      if (key === "step") {
        fields.steps.push(value);
        last = { kind: "step", key: "" };
        return;
      }
      if (key === "encoded") {
        fields.encoded.push(value);
        last = { kind: "encoded", key: "" };
        return;
      }
      if (key === "hotspot") {
        fields.hotspots.push(value);
        last = { kind: "hotspot", key: "" };
        return;
      }
      if (SINGLE_LABELS.has(key)) {
        if (fields.singles.has(key)) {
          errors.push({
            line: lineNo,
            message: `"${labelled[1]}" appears more than once in this block.`,
          });
          return;
        }
        fields.singles.set(key, value);
        // A scalar label closes itself — the next unlabelled line is prose,
        // not a continuation of it.
        last = SCALAR_LABELS.has(key)
          ? { kind: "prose", key: "" }
          : { kind: "single", key };
        return;
      }
    }

    if (!line.trim()) return;

    // Markup never continues a labelled field — otherwise the <svg> lines in a
    // diagram fence get appended to whatever Caption: or Title: preceded them.
    if (line.trim().startsWith("<")) {
      fields.prose.push(line);
      last = { kind: "prose", key: "" };
      return;
    }

    // Unlabelled: continue whatever field was opened last.
    switch (last.kind) {
      case "single":
        fields.singles.set(last.key, `${fields.singles.get(last.key)}\n${line.trim()}`);
        return;
      case "step":
        fields.steps[fields.steps.length - 1] += `\n${line.trim()}`;
        return;
      case "encoded":
        fields.encoded[fields.encoded.length - 1] += `\n${line.trim()}`;
        return;
      case "hotspot":
        fields.hotspots[fields.hotspots.length - 1] += `\n${line.trim()}`;
        return;
      case "option":
        fields.options.set(last.key, `${fields.options.get(last.key)}\n${line.trim()}`);
        return;
      default:
        fields.prose.push(line.trim());
    }
  });

  return fields;
}

export type FenceContext = {
  id: string;
  openLine: number;
  previousNonCheckId: string | null;
  warnings: Issue[];
  errors: Issue[];
};

/** `Cornea @ 20,50 — Bends incoming light.` → a hotspot. */
function parseHotspot(raw: string, index: number): DiagramHotspot {
  const [head, ...rest] = raw.split(/\s+—\s+|\s+--\s+/);
  const text = rest.join(" — ").trim();
  const coords = /@\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/.exec(head);
  const label = head.replace(/@\s*-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?/, "").trim();
  return {
    id: `${slugify(label || "hotspot")}-${index + 1}`,
    label: label || "Part",
    text,
    x: coords ? Number(coords[1]) : undefined,
    y: coords ? Number(coords[2]) : undefined,
  };
}

export function buildFenceBlock(
  type: FenceType,
  fields: FenceFields,
  ctx: FenceContext,
): LessonBlock | null {
  const { errors, warnings, openLine } = ctx;
  const get = (key: string) => fields.singles.get(key) ?? "";

  switch (type) {
    case "example": {
      const mode = get("mode").toLowerCase();
      const block: ExampleBlock = {
        type: "example",
        id: ctx.id,
        title: get("title") || undefined,
        problem: get("problem"),
        steps: fields.steps,
        answer: get("answer"),
        mode:
          mode === "partial" || mode === "solo"
            ? (mode as ExampleMode)
            : "worked",
      };
      if (!block.problem) {
        errors.push({ line: openLine, message: "An example needs a Problem: line." });
        return null;
      }
      if (!block.answer) {
        errors.push({ line: openLine, message: "An example needs an Answer: line." });
        return null;
      }
      return block;
    }
    case "tip": {
      // A tip is prose with an optional Exam: tag — its text is never labelled.
      const text = fields.prose.join("\n").trim();
      if (!text) {
        errors.push({ line: openLine, message: "A tip fence has no text." });
        return null;
      }
      const exam = get("exam").toUpperCase();
      let examType: ExamTypeTag | undefined;
      if (exam) {
        if ((EXAM_TYPES as readonly string[]).includes(exam)) {
          examType = exam as ExamTypeTag;
        } else {
          warnings.push({
            line: openLine,
            message: `Exam tag "${exam}" is not one of ${EXAM_TYPES.join(", ")} — dropped.`,
          });
        }
      }
      const block: TipBlock = { type: "tip", id: ctx.id, text, examType };
      return block;
    }
    case "mistake": {
      const block: MistakeBlock = {
        type: "mistake",
        id: ctx.id,
        wrong: get("wrong"),
        right: get("right"),
      };
      if (!block.wrong || !block.right) {
        errors.push({
          line: openLine,
          message: "A mistake fence needs both Wrong: and Right: lines.",
        });
        return null;
      }
      return block;
    }
    case "mnemonic": {
      const block: MnemonicBlock = {
        type: "mnemonic",
        id: ctx.id,
        phrase: get("phrase"),
        encoded: fields.encoded,
      };
      if (!block.phrase) {
        errors.push({ line: openLine, message: "A mnemonic fence needs a Phrase: line." });
        return null;
      }
      return block;
    }
    case "check": {
      const question = get("q");
      const options = Object.fromEntries(fields.options);
      const answer = get("correct").trim().toUpperCase();
      if (!question) {
        errors.push({ line: openLine, message: "A check needs a Q: line." });
        return null;
      }
      if (Object.keys(options).length < 2) {
        errors.push({ line: openLine, message: "A check needs at least two options." });
        return null;
      }
      if (!Object.prototype.hasOwnProperty.call(options, answer)) {
        errors.push({
          line: openLine,
          message: `Correct: "${answer}" is not one of this check's options.`,
        });
        return null;
      }
      const afterCard = get("after") || ctx.previousNonCheckId || "";
      if (!afterCard) {
        errors.push({
          line: openLine,
          message: "A check cannot be the first block — put it after a card.",
        });
        return null;
      }
      const block: CheckBlock = {
        type: "check",
        id: ctx.id,
        question,
        options,
        answer,
        explanation: get("why"),
        afterCard,
      };
      return block;
    }
    case "diagram": {
      // Everything that was not a recognised label is the SVG source.
      const rawSvg = fields.raw
        .filter((line) => !/^([A-Za-z]+):/.test(line.trim()))
        .join("\n")
        .trim();
      const { svg, warnings: svgWarnings } = sanitizeSvg(rawSvg);
      if (!svg) {
        errors.push({ line: openLine, message: "A diagram fence needs an inline <svg> element." });
        return null;
      }
      svgWarnings.forEach((w) => warnings.push({ line: openLine, message: w.message }));
      const block: DiagramBlock = {
        type: "diagram",
        id: ctx.id,
        title: get("title") || undefined,
        caption: get("caption") || undefined,
        svg,
        hotspots: fields.hotspots.map(parseHotspot),
      };
      return block;
    }
    default:
      return null;
  }
}
