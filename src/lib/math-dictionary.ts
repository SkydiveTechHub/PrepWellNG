import {
  isMathSpan,
  segmentMarkdown,
  splitInline,
  stripMathDelimiters,
} from "./markdown-segments";

// Finds every formula in a lesson or flashcard payload so the server can
// render them all up front.
//
// KaTeX is ~260KB of JavaScript. It used to reach the browser on the two
// routes students spend the most time on -- the lesson player and the
// flashcard deck -- because both are client components and both import the
// markdown renderer, which imported KaTeX directly.
//
// Nothing on those routes needs a formula *renderer*, though: the maths in a
// lesson is fixed the moment the lesson is authored. What the browser needs is
// the rendered markup. So the server walks the payload, renders each distinct
// formula once, and ships a `tex -> html` dictionary alongside it. See
// `buildMathDictionary` in src/lib/latex.ts for the rendering half.
//
// Pure and KaTeX-free, so importing it from a client component costs nothing.

/** Rendered KaTeX markup, keyed by {@link mathKey}. */
export type MathDictionary = Record<string, string>;

/** A formula to render: its source and whether it is display or inline. */
export type MathRef = { tex: string; displayMode: boolean };

/**
 * Dictionary key for a formula.
 *
 * Display mode is part of the key because KaTeX renders the same source
 * differently in each -- `\sum` grows its limits above and below in display
 * mode and tucks them beside in inline mode -- so one entry cannot serve both.
 *
 * The mode is a single leading character followed by a fixed separator, which
 * makes the split unambiguous whatever the formula contains: everything after
 * the first `|` is the source, including any further `|` of its own.
 */
export function mathKey(tex: string, displayMode: boolean): string {
  return `${displayMode ? "d" : "i"}|${tex}`;
}

function addInlineMath(text: string, into: Map<string, MathRef>) {
  for (const part of splitInline(text)) {
    if (!isMathSpan(part)) continue;
    const tex = stripMathDelimiters(part);
    into.set(mathKey(tex, false), { tex, displayMode: false });
  }
}

/**
 * Collects the formulas one string will ask for when rendered.
 *
 * Both renderings of that string are covered -- `<Markdown>`, which segments
 * it into blocks first, and `<InlineMarkdown>`, which does not. A caller
 * cannot generally tell which of the two a given field will get (a block's
 * `text` reaches both, depending on the surface), and collecting for the wrong
 * one would leave the browser with a missing entry. Over-collecting only costs
 * a few bytes in the payload.
 */
export function collectMathFromText(text: string, into: Map<string, MathRef>) {
  for (const segment of segmentMarkdown(text)) {
    switch (segment.kind) {
      case "math":
        into.set(mathKey(segment.tex, true), {
          tex: segment.tex,
          displayMode: true,
        });
        break;
      case "heading":
        // Headings render as plain text -- no inline pass, so no maths.
        break;
      case "p":
        addInlineMath(segment.text, into);
        break;
      case "ul":
      case "ol":
        for (const item of segment.items) addInlineMath(item, into);
        break;
      case "table":
        for (const cell of segment.header) addInlineMath(cell, into);
        for (const row of segment.rows) {
          for (const cell of row) addInlineMath(cell, into);
        }
        break;
    }
  }

  // The `<InlineMarkdown>` path: the whole string, unsegmented.
  addInlineMath(text, into);
}

/**
 * Every formula reachable in an arbitrary payload — a `LessonBlock[]`, a
 * flashcard's JSON `payload`, or a bare string.
 *
 * Walking the whole structure rather than naming the fields is deliberate:
 * lesson blocks are a wide union whose members keep gaining prose fields, and
 * a field added to the union but forgotten here would silently lose its maths
 * in the browser while still rendering on the server.
 */
export function collectMathRefs(value: unknown): Map<string, MathRef> {
  const refs = new Map<string, MathRef>();

  const walk = (node: unknown) => {
    if (typeof node === "string") {
      collectMathFromText(node, refs);
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (node && typeof node === "object") {
      for (const item of Object.values(node)) walk(item);
    }
  };

  walk(value);
  return refs;
}
