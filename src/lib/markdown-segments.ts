// Splits the lesson markdown subset into renderable segments. Pure and
// React-free so it can be tested under node:test.
//
// Blocks are separated by blank lines, but a single block may mix kinds --
// a lead-in sentence followed by a numbered list is one block and two
// segments -- so each block is further split into runs of like lines.

export type Segment =
  | { kind: "heading"; text: string }
  | { kind: "p"; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] }
  | { kind: "table"; header: string[]; rows: string[][] }
  | { kind: "rule" };

const RULE_RE = /^\s*(-{3,}|\*{3,}|_{3,})\s*$/;
const UL_RE = /^\s*[-*]\s+(.*)$/;
const OL_RE = /^\s*\d+[.)]\s+(.*)$/;
const DELIMITER_RE = /^\s*\|[\s:|-]+\|\s*$/;

function isTableRow(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith("|") && trimmed.endsWith("|") && trimmed.length > 2;
}

function cells(line: string): string[] {
  return line
    .trim()
    .slice(1, -1)
    .split("|")
    .map((cell) => cell.trim());
}

/**
 * A table needs a header, a `|---|` delimiter and at least the shape of a
 * body. Anything that fails those tests falls back to a paragraph rather
 * than rendering a broken grid -- the same fail-safe posture sanitizeSvg
 * takes, for the same reason: this input is authored by hand and untrusted.
 */
function readTable(lines: string[]): Segment | null {
  if (lines.length < 2) return null;
  if (!isTableRow(lines[0]) || !DELIMITER_RE.test(lines[1])) return null;
  if (!lines.every(isTableRow)) return null;
  return {
    kind: "table",
    header: cells(lines[0]),
    rows: lines.slice(2).map(cells),
  };
}

type LineKind = "rule" | "ul" | "ol" | "table" | "text";

function lineKind(line: string): LineKind {
  if (RULE_RE.test(line)) return "rule";
  if (UL_RE.test(line)) return "ul";
  if (OL_RE.test(line)) return "ol";
  if (isTableRow(line)) return "table";
  return "text";
}

export function segmentMarkdown(content: string): Segment[] {
  const segments: Segment[] = [];

  for (const block of content.split(/\n{2,}/)) {
    const lines = block.split("\n").filter((line) => line.trim());
    if (lines.length === 0) continue;

    // A rule is `---`, but `- item` is a bullet; RULE_RE is checked first in
    // lineKind, so ordering here is already correct.
    let run: string[] = [];
    let runKind: LineKind | null = null;

    const flushRun = () => {
      if (run.length === 0 || runKind === null) return;
      switch (runKind) {
        case "rule":
          run.forEach(() => segments.push({ kind: "rule" }));
          break;
        case "ul":
          segments.push({
            kind: "ul",
            items: run.map((line) => (UL_RE.exec(line) as RegExpExecArray)[1]),
          });
          break;
        case "ol":
          segments.push({
            kind: "ol",
            items: run.map((line) => (OL_RE.exec(line) as RegExpExecArray)[1]),
          });
          break;
        case "table": {
          const table = readTable(run);
          // Fail safe: an unparseable table is readable text, not a broken grid.
          segments.push(table ?? { kind: "p", text: run.join("\n") });
          break;
        }
        default: {
          const text = run.join("\n");
          const heading = /^#{2,4}\s+(.*)$/.exec(text.trim());
          if (heading && run.length === 1) segments.push({ kind: "heading", text: heading[1] });
          else segments.push({ kind: "p", text });
        }
      }
      run = [];
      runKind = null;
    };

    for (const line of lines) {
      const kind = lineKind(line);
      if (kind !== runKind) {
        flushRun();
        runKind = kind;
      }
      run.push(line);
    }
    flushRun();
  }

  return segments;
}
