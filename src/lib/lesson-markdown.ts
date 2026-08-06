import type { LessonBlock, ConceptBlock } from "@/lib/lesson-engine";
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
} from "@/lib/lesson-engine";

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

const FENCE_TYPES = [
  "example",
  "tip",
  "mistake",
  "mnemonic",
  "check",
  "diagram",
] as const;
type FenceType = (typeof FENCE_TYPES)[number];

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
function readFence(
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

type FenceContext = {
  id: string;
  openLine: number;
  previousNonCheckId: string | null;
  warnings: Issue[];
  errors: Issue[];
};

// ─── SVG sanitiser ───────────────────────────────────────────
//
// InteractiveDiagram renders block.svg through dangerouslySetInnerHTML, so
// uploaded markup executes in student pages. This is an allowlist: anything
// not named here is removed. Never convert it to a blocklist.

const SVG_ELEMENTS = new Set([
  "svg", "g", "path", "circle", "ellipse", "rect", "line", "polyline",
  "polygon", "text", "tspan", "defs", "marker", "lineargradient",
  "radialgradient", "stop", "title", "desc",
]);

/** Elements dropped along with everything inside them. */
const SVG_VOID_HOSTILE = new Set([
  "script", "style", "foreignobject", "use", "image", "iframe", "animate",
  "set", "handler",
]);

const SVG_ATTRS = new Set([
  "d", "x", "y", "x1", "y1", "x2", "y2", "cx", "cy", "r", "rx", "ry",
  "width", "height", "points", "transform", "viewbox", "preserveaspectratio",
  "fill", "fill-opacity", "fill-rule", "stroke", "stroke-width",
  "stroke-linecap", "stroke-linejoin", "stroke-dasharray", "opacity",
  "font-size", "font-family", "font-weight", "text-anchor", "dominant-baseline",
  "offset", "stop-color", "stop-opacity", "gradientunits", "marker-end",
  "marker-start", "id", "class", "xmlns",
]);

export function sanitizeSvg(svg: string): { svg: string; warnings: Issue[] } {
  const warnings: Issue[] = [];
  const seen = new Set<string>();
  const warn = (message: string) => {
    if (seen.has(message)) return;
    seen.add(message);
    warnings.push({ message });
  };

  let out = svg;

  // 1. Drop hostile elements with their contents (and self-closing forms),
  // to a fixed point.
  //
  // Removing one hostile tag can splice the surrounding text back together
  // into a hostile tag that was not literally present before — e.g.
  // `<scr<use/>ipt>` is not `<script>` until the embedded `<use/>` is cut
  // out, at which point "<scr" and "ipt>" become adjacent and read as
  // "<script>". A single left-to-right pass over the original text cannot
  // see a match that only exists after an earlier removal, so this
  // re-scans the *entire current string* and loops until nothing more
  // matches, rather than assuming one pass per tag name is enough.
  const HOSTILE_NAMES = [...SVG_VOID_HOSTILE].join("|");
  const hostilePaired = new RegExp(`<(${HOSTILE_NAMES})\\b[^>]*>[\\s\\S]*?<\\/\\1\\s*>`, "gi");
  const hostileSelfClosing = new RegExp(`<(${HOSTILE_NAMES})\\b[^>]*\\/?>`, "gi");
  let previous: string;
  do {
    previous = out;
    out = out.replace(hostilePaired, (_match, name: string) => {
      warn(`<${name.toLowerCase()}> is not allowed in a diagram and was removed.`);
      return "";
    });
    out = out.replace(hostileSelfClosing, (_match, name: string) => {
      warn(`<${name.toLowerCase()}> is not allowed in a diagram and was removed.`);
      return "";
    });
  } while (out !== previous);

  // Attribute values are re-emitted inside a freshly built double-quoted
  // string. A value captured from a *single*-quoted original attribute may
  // legally contain a literal `"` (e.g. `id='x" onclick="alert(1)"'`) — if
  // that character were written back out unescaped it would close our
  // double-quoted attribute early and let the rest of the value reappear as
  // live markup (a new, unfiltered attribute). Escaping `&`, `"`, `<` and
  // `>` in every kept value closes that hole.
  const escapeAttrValue = (value: string) =>
    value
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  // 2. Walk remaining tags with a fail-closed scanner.
  //
  // `String.replace` alone is fail-OPEN: text a regex does not match is
  // left in the output untouched. The previous implementation required
  // every quote inside a tag's attribute region to pair up — but an
  // unpaired `'` or `"` is legal in an HTML *unquoted* attribute value
  // (browsers treat it as an ordinary character there), so a payload like
  // `fill=#fff' onmouseover="alert(1)"` desynced the regex, the whole tag
  // failed to match, and it survived byte-for-byte in the output —
  // including the event handler, with zero warnings.
  //
  // This scans left to right instead. Every `<` must resolve to a
  // well-formed, allowlisted tag (attribute values may be quoted OR
  // unquoted, per HTML5); anything else — a genuinely malformed tag, or an
  // unrecognised element — is dropped from that `<` through the next `>`
  // (or to the end of input) rather than being left in place. Fail closed,
  // never fail open.
  const UNQUOTED_VALUE = `[^\\s"'\`=<>]+`;
  const ATTR_VALUE = `(?:"[^"]*"|'[^']*'|${UNQUOTED_VALUE})`;
  const ATTR = `[a-zA-Z_:][-a-zA-Z0-9_:.]*(?:\\s*=\\s*${ATTR_VALUE})?`;
  const OPEN_TAG_RE = new RegExp(`^<([a-zA-Z][a-zA-Z0-9-]*)((?:\\s+${ATTR})*)\\s*(/)?>`);
  const CLOSE_TAG_RE = /^<\/([a-zA-Z][a-zA-Z0-9-]*)\s*>/;
  const ATTR_RE = new RegExp(`([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\\s*=\\s*(${ATTR_VALUE}))?`, "g");

  let result = "";
  let i = 0;
  while (i < out.length) {
    if (out[i] !== "<") {
      result += out[i];
      i += 1;
      continue;
    }

    const rest = out.slice(i);

    const close = CLOSE_TAG_RE.exec(rest);
    if (close) {
      const name = close[1].toLowerCase();
      if (SVG_ELEMENTS.has(name)) {
        result += `</${name}>`;
      } else {
        warn(`<${close[1]}> is not an allowed diagram element and was removed.`);
      }
      i += close[0].length;
      continue;
    }

    const open = OPEN_TAG_RE.exec(rest);
    if (open) {
      const [full, rawName, rawAttrs, slash] = open;
      const name = rawName.toLowerCase();
      if (!SVG_ELEMENTS.has(name)) {
        warn(`<${rawName}> is not an allowed diagram element and was removed.`);
      } else {
        const kept: string[] = [];
        let m: RegExpExecArray | null;
        ATTR_RE.lastIndex = 0;
        while ((m = ATTR_RE.exec(rawAttrs))) {
          const attr = m[1].toLowerCase();
          const rawValue = m[2];
          const value = rawValue
            ? /^["']/.test(rawValue)
              ? rawValue.slice(1, -1)
              : rawValue
            : "";
          if (attr.startsWith("on")) {
            warn(`Event handler "${m[1]}" was removed from <${name}>.`);
            continue;
          }
          if (attr === "href" || attr === "xlink:href") {
            if (value.startsWith("#")) {
              kept.push(`${attr}="${escapeAttrValue(value)}"`);
            } else {
              warn(`href "${value}" is not a same-document fragment and was removed.`);
            }
            continue;
          }
          if (attr.startsWith("aria-") || SVG_ATTRS.has(attr)) {
            kept.push(`${m[1]}="${escapeAttrValue(value)}"`);
            continue;
          }
          warn(`Attribute "${m[1]}" is not allowed on <${name}> and was removed.`);
        }
        result += `<${name}${kept.length ? " " + kept.join(" ") : ""}${slash ? "/" : ""}>`;
      }
      i += full.length;
      continue;
    }

    // Not a well-formed tag at this `<` — fail closed: drop through the
    // next `>` (or to the end of input if there is none) instead of
    // leaving unrecognised markup, attributes and all, in the output.
    const nextGt = rest.indexOf(">");
    const dropped = nextGt === -1 ? rest : rest.slice(0, nextGt + 1);
    warn("Malformed or unrecognised markup was removed from the diagram.");
    i += dropped.length;
  }
  out = result;

  if (!/<svg\b/i.test(out)) {
    return {
      svg: "",
      warnings: [{ message: "No <svg> element found in this diagram." }],
    };
  }
  return { svg: out.trim(), warnings };
}

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

function buildFenceBlock(
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
