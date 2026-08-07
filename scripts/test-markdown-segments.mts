import { test } from "node:test";
import assert from "node:assert/strict";
import { segmentMarkdown, splitInline } from "../src/lib/markdown-segments";

test("a pipe table becomes a table segment", () => {
  const segments = segmentMarkdown(
    ["| Quantity | Unit |", "|---|---|", "| Length | metre |", "| Mass | kilogram |"].join("\n"),
  );
  assert.equal(segments.length, 1);
  assert.equal(segments[0].kind, "table");
  const table = segments[0] as Extract<ReturnType<typeof segmentMarkdown>[number], { kind: "table" }>;
  assert.deepEqual(table.header, ["Quantity", "Unit"]);
  assert.deepEqual(table.rows, [["Length", "metre"], ["Mass", "kilogram"]]);
});

test("a table without a delimiter row falls back to a paragraph", () => {
  const segments = segmentMarkdown("| Quantity | Unit |\n| Length | metre |");
  assert.equal(segments.length, 1);
  assert.equal(segments[0].kind, "p");
});

test("a lead-in line followed by numbered items splits into a paragraph and a list", () => {
  const segments = segmentMarkdown(
    [
      "By the end of this lesson, students should be able to:",
      "1. Define measurement",
      "2. Distinguish quantities",
    ].join("\n"),
  );
  assert.equal(segments.length, 2);
  assert.equal(segments[0].kind, "p");
  assert.equal((segments[0] as { kind: "p"; text: string }).text, "By the end of this lesson, students should be able to:");
  assert.equal(segments[1].kind, "ol");
  assert.deepEqual((segments[1] as { kind: "ol"; items: string[] }).items, [
    "Define measurement",
    "Distinguish quantities",
  ]);
});

test("bulleted lists still work", () => {
  const segments = segmentMarkdown("- one\n- two");
  assert.equal(segments[0].kind, "ul");
  assert.deepEqual((segments[0] as { kind: "ul"; items: string[] }).items, ["one", "two"]);
});

test("a horizontal rule becomes a rule segment", () => {
  const segments = segmentMarkdown("Text.\n\n---\n\nMore.");
  assert.deepEqual(segments.map((s) => s.kind), ["p", "rule", "p"]);
});

test("headings are recognised", () => {
  const segments = segmentMarkdown("## Heading\n\nText.");
  assert.equal(segments[0].kind, "heading");
  assert.equal((segments[0] as { kind: "heading"; text: string }).text, "Heading");
});

test("a plain paragraph keeps its internal line breaks as one segment", () => {
  const segments = segmentMarkdown("One line\nand another.");
  assert.equal(segments.length, 1);
  assert.equal(segments[0].kind, "p");
});

// ─── Finding 6: the italic span must respect CommonMark flanking rules ─────

test("splitInline does not treat arithmetic asterisks as italics", () => {
  assert.deepEqual(splitInline("2 * 3 * 4"), ["2 * 3 * 4"]);
});

test("splitInline still recognises a genuine italic span", () => {
  assert.deepEqual(splitInline("this is *italic* text"), ["this is ", "*italic*", " text"]);
});

test("splitInline still recognises a genuine bold span", () => {
  assert.deepEqual(splitInline("this is **bold** text"), ["this is ", "**bold**", " text"]);
});

test("splitInline leaves a bare '****' run as plain text (unchanged from before the fix)", () => {
  assert.deepEqual(splitInline("****"), ["****"]);
});

// ─── maths ───────────────────────────────────────────────────

test("a $$...$$ block becomes a display-math segment", () => {
  const segments = segmentMarkdown("$$MA = \frac{Load}{Effort}$$");
  assert.equal(segments.length, 1);
  assert.equal(segments[0].kind, "math");
  assert.equal(
    (segments[0] as { kind: "math"; tex: string }).tex,
    "MA = \frac{Load}{Effort}",
    "the $$ delimiters must be stripped before KaTeX sees the source",
  );
});

test("display math spanning several lines is one segment", () => {
  const segments = segmentMarkdown("$$\nE = mc^2\n$$");
  assert.equal(segments.length, 1);
  assert.equal(segments[0].kind, "math");
  assert.equal((segments[0] as { kind: "math"; tex: string }).tex, "E = mc^2");
});

test("a labelled formula keeps its label as prose and the maths as maths", () => {
  // "**Mechanical Advantage (MA):** $$MA = \frac{Load}{Effort}$$" is how the
  // real notes are written -- label and formula on ONE line.
  const segments = segmentMarkdown("**Mechanical Advantage (MA):** $$MA = \frac{Load}{Effort}$$");
  assert.equal(segments.length, 1);
  assert.equal(segments[0].kind, "p", "a line with a label is prose carrying inline maths");
});

test("inline $...$ is split out of prose", () => {
  const parts = splitInline("The ratio $x = 2y$ holds.");
  assert.ok(parts.includes("$x = 2y$"), `got: ${JSON.stringify(parts)}`);
});

test("inline maths is found inside a labelled formula line", () => {
  const parts = splitInline("**Efficiency:** $$E = \frac{MA}{VR}$$");
  assert.ok(
    parts.some((p) => p.startsWith("$")),
    `the formula should be split out for KaTeX: ${JSON.stringify(parts)}`,
  );
});

test("currency is not mistaken for maths", () => {
  // "$5 and $10" must stay literal text -- the closing delimiter candidate is
  // preceded by a space, so it cannot open a span.
  for (const text of ["It costs $5 and $10 more.", "Pay $20 today."]) {
    const parts = splitInline(text);
    assert.equal(parts.length, 1, `currency was split: ${JSON.stringify(parts)}`);
    assert.equal(parts[0], text);
  }
});
