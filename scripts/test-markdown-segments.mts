import { test } from "node:test";
import assert from "node:assert/strict";
import { segmentMarkdown } from "../src/lib/markdown-segments";

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
