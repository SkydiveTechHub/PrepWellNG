import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLessonMarkdown, sanitizeSvg, validateLessonMarkdown } from "../src/lib/lesson-markdown";
import type { ConceptBlock } from "../src/lib/lesson-engine";
import type {
  ExampleBlock,
  TipBlock,
  MistakeBlock,
  MnemonicBlock,
  CheckBlock,
  DiagramBlock,
} from "../src/lib/lesson-engine";
import { MAX_CARD_WORDS, blockWordCount } from "../src/lib/lesson-engine";

test("a bare heading and paragraph become one concept block", () => {
  const result = parseLessonMarkdown(
    "## What is photosynthesis?\n\nGreen plants use light energy.",
  );
  assert.deepEqual(result.errors, []);
  assert.equal(result.blocks.length, 1);
  const block = result.blocks[0] as ConceptBlock;
  assert.equal(block.type, "concept");
  assert.equal(block.title, "What is photosynthesis?");
  assert.equal(block.text, "Green plants use light energy.");
  assert.equal(block.id, "what-is-photosynthesis-1");
});

test("frontmatter is parsed and stripped from the body", () => {
  const result = parseLessonMarkdown(
    [
      "---",
      "title: Photosynthesis",
      "summary: How plants make food.",
      "estimatedMinutes: 25",
      "difficulty: INTERMEDIATE",
      "subject: biology",
      "topic: photosynthesis",
      "---",
      "",
      "## Overview",
      "",
      "Body text.",
    ].join("\n"),
  );
  assert.equal(result.meta.title, "Photosynthesis");
  assert.equal(result.meta.summary, "How plants make food.");
  assert.equal(result.meta.estimatedMinutes, 25);
  assert.equal(result.meta.difficulty, "INTERMEDIATE");
  assert.equal(result.meta.subject, "biology");
  assert.equal(result.meta.topic, "photosynthesis");
  assert.equal(result.blocks.length, 1);
  assert.equal((result.blocks[0] as ConceptBlock).title, "Overview");
});

test("a file with no frontmatter parses fine", () => {
  const result = parseLessonMarkdown("## A\n\nText.");
  assert.deepEqual(result.meta, {});
  assert.deepEqual(result.errors, []);
});

test("an unknown frontmatter key warns but does not fail", () => {
  const result = parseLessonMarkdown(
    "---\ntitle: A\nkeyPoints: nope\n---\n\n## A\n\nText.",
  );
  assert.deepEqual(result.errors, []);
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0].message, /keyPoints/);
});

test("a non-numeric estimatedMinutes is an error, not a silent zero", () => {
  const result = parseLessonMarkdown(
    "---\nestimatedMinutes: soon\n---\n\n## A\n\nText.",
  );
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0].message, /estimatedMinutes/);
});

test("an out-of-range difficulty is an error", () => {
  const result = parseLessonMarkdown(
    "---\ndifficulty: EASY\n---\n\n## A\n\nText.",
  );
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0].message, /difficulty/);
});

test("a single-hash heading supplies the title when frontmatter omits it", () => {
  const result = parseLessonMarkdown("# Photosynthesis\n\n## Overview\n\nText.");
  assert.equal(result.meta.title, "Photosynthesis");
});

test("frontmatter title wins over a single-hash heading", () => {
  const result = parseLessonMarkdown(
    "---\ntitle: From frontmatter\n---\n\n# From heading\n\n## A\n\nText.",
  );
  assert.equal(result.meta.title, "From frontmatter");
});

test("### Reveal inside a concept becomes the reveal field", () => {
  const result = parseLessonMarkdown(
    "## Osmosis\n\nWater moves down a gradient.\n\n### Reveal\n\nThe membrane must be partially permeable.",
  );
  assert.equal(result.blocks.length, 1);
  const block = result.blocks[0] as ConceptBlock;
  assert.equal(block.text, "Water moves down a gradient.");
  assert.equal(block.reveal, "The membrane must be partially permeable.");
});

test("multiple headings produce blocks in document order with unique ids", () => {
  const result = parseLessonMarkdown("## First\n\nA.\n\n## Second\n\nB.");
  assert.equal(result.blocks.length, 2);
  assert.equal(result.blocks[0].id, "first-1");
  assert.equal(result.blocks[1].id, "second-1");
});

test("two headings with the same text get distinct ids", () => {
  const result = parseLessonMarkdown("## Same\n\nA.\n\n## Same\n\nB.");
  assert.notEqual(result.blocks[0].id, result.blocks[1].id);
});

test("an empty document is an error rather than an empty success", () => {
  const result = parseLessonMarkdown("   \n\n  ");
  assert.equal(result.blocks.length, 0);
  assert.equal(result.errors.length, 1);
});

const LEAD = "## Forces\n\nA force is a push or a pull.\n\n";

test("an example fence becomes an ExampleBlock with ordered steps", () => {
  const result = parseLessonMarkdown(
    LEAD +
      [
        ":::example",
        "Problem: A 4 kg mass is pushed with 20 N. Find the acceleration.",
        "Step: Write F = ma.",
        "Step: Substitute F = 20, m = 4.",
        "Answer: 5 m/s²",
        "Mode: worked",
        ":::",
      ].join("\n"),
  );
  assert.deepEqual(result.errors, []);
  const block = result.blocks[1] as ExampleBlock;
  assert.equal(block.type, "example");
  assert.equal(block.problem, "A 4 kg mass is pushed with 20 N. Find the acceleration.");
  assert.deepEqual(block.steps, ["Write F = ma.", "Substitute F = 20, m = 4."]);
  assert.equal(block.answer, "5 m/s²");
  assert.equal(block.mode, "worked");
});

test("an example with no Mode defaults to worked", () => {
  const result = parseLessonMarkdown(
    LEAD + ":::example\nProblem: P.\nStep: S.\nAnswer: A.\n:::",
  );
  assert.equal((result.blocks[1] as ExampleBlock).mode, "worked");
});

test("an unlabelled line continues the previous field", () => {
  const result = parseLessonMarkdown(
    LEAD + ":::example\nProblem: Line one\nline two.\nStep: S.\nAnswer: A.\n:::",
  );
  assert.equal((result.blocks[1] as ExampleBlock).problem, "Line one\nline two.");
});

test("a tip fence carries prose and an optional exam tag", () => {
  const result = parseLessonMarkdown(
    LEAD + ":::tip\nExam: WAEC\nCheck the units before choosing a formula.\n:::",
  );
  const block = result.blocks[1] as TipBlock;
  assert.equal(block.type, "tip");
  assert.equal(block.text, "Check the units before choosing a formula.");
  assert.equal(block.examType, "WAEC");
});

test("an unrecognised exam tag warns and is dropped rather than stored invalid", () => {
  const result = parseLessonMarkdown(LEAD + ":::tip\nExam: GCSE\nSome advice.\n:::");
  assert.deepEqual(result.errors, []);
  assert.equal((result.blocks[1] as TipBlock).examType, undefined);
  assert.equal(result.warnings.length, 1);
});

test("a mistake fence carries wrong and right", () => {
  const result = parseLessonMarkdown(
    LEAD + ":::mistake\nWrong: Adding opposing forces.\nRight: Subtract them, then apply F = ma.\n:::",
  );
  const block = result.blocks[1] as MistakeBlock;
  assert.equal(block.wrong, "Adding opposing forces.");
  assert.equal(block.right, "Subtract them, then apply F = ma.");
});

test("a mnemonic fence keeps encoded lines in order", () => {
  const result = parseLessonMarkdown(
    LEAD + ":::mnemonic\nPhrase: My Very Easy Method\nEncoded: Mercury\nEncoded: Venus\n:::",
  );
  const block = result.blocks[1] as MnemonicBlock;
  assert.equal(block.phrase, "My Very Easy Method");
  assert.deepEqual(block.encoded, ["Mercury", "Venus"]);
});

test("a check fence becomes a CheckBlock with lettered options", () => {
  const result = parseLessonMarkdown(
    LEAD +
      [
        ":::check",
        "Q: What is the SI unit of force?",
        "A) Joule",
        "B) Newton",
        "C) Watt",
        "Correct: B",
        "Why: Force is measured in newtons.",
        ":::",
      ].join("\n"),
  );
  assert.deepEqual(result.errors, []);
  const block = result.blocks[1] as CheckBlock;
  assert.equal(block.type, "check");
  assert.equal(block.question, "What is the SI unit of force?");
  assert.deepEqual(block.options, { A: "Joule", B: "Newton", C: "Watt" });
  assert.equal(block.answer, "B");
  assert.equal(block.explanation, "Force is measured in newtons.");
});

test("a check attaches to the preceding non-check block by default", () => {
  const result = parseLessonMarkdown(
    LEAD + ":::check\nQ: Q?\nA) One\nB) Two\nCorrect: A\nWhy: Because.\n:::",
  );
  assert.equal((result.blocks[1] as CheckBlock).afterCard, result.blocks[0].id);
});

test("an explicit After: overrides the implicit attachment", () => {
  const result = parseLessonMarkdown(
    "## First\n\nA.\n\n## Second\n\nB.\n\n" +
      ":::check\nQ: Q?\nA) One\nB) Two\nCorrect: A\nWhy: Because.\nAfter: first-1\n:::",
  );
  assert.equal((result.blocks[2] as CheckBlock).afterCard, "first-1");
});

test("a check whose Correct names no option is an error", () => {
  const result = parseLessonMarkdown(
    LEAD + ":::check\nQ: Q?\nA) One\nB) Two\nCorrect: D\nWhy: Because.\n:::",
  );
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0].message, /Correct/);
});

test("a check with fewer than two options is an error", () => {
  const result = parseLessonMarkdown(
    LEAD + ":::check\nQ: Q?\nA) Only one\nCorrect: A\nWhy: Because.\n:::",
  );
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0].message, /two/i);
});

test("an unclosed fence is an error naming the line it opened on", () => {
  const result = parseLessonMarkdown(LEAD + ":::example\nProblem: P.");
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0].message, /never closed/i);
  assert.equal(result.errors[0].line, 5);
});

test("an unknown fence type is an error", () => {
  const result = parseLessonMarkdown(LEAD + ":::video\nsrc: x\n:::");
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0].message, /video/);
});

test("a repeated single-value label is an error", () => {
  const result = parseLessonMarkdown(
    LEAD + ":::mistake\nWrong: A.\nWrong: B.\nRight: C.\n:::",
  );
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0].message, /Wrong/);
});

test("a fence interrupts the concept section it sits inside", () => {
  const result = parseLessonMarkdown(
    "## Forces\n\nProse before.\n\n:::tip\nAdvice.\n:::\n\nProse after.",
  );
  assert.equal(result.blocks.length, 3);
  assert.equal(result.blocks[0].type, "concept");
  assert.equal(result.blocks[1].type, "tip");
  assert.equal(result.blocks[2].type, "concept");
});

test("a plain svg survives sanitisation unchanged in substance", () => {
  const { svg, warnings } = sanitizeSvg(
    '<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="red"/></svg>',
  );
  assert.match(svg, /<svg/);
  assert.match(svg, /viewBox="0 0 10 10"/);
  assert.match(svg, /<circle/);
  assert.match(svg, /fill="red"/);
  assert.deepEqual(warnings, []);
});

test("a script element is removed with its contents", () => {
  const { svg, warnings } = sanitizeSvg(
    '<svg><script>alert(1)</script><circle r="1"/></svg>',
  );
  assert.doesNotMatch(svg, /script/i);
  assert.doesNotMatch(svg, /alert/);
  assert.equal(warnings.length >= 1, true);
});

test("event handler attributes are stripped", () => {
  const { svg, warnings } = sanitizeSvg('<svg onload="steal()"><circle onclick="x()" r="1"/></svg>');
  assert.doesNotMatch(svg, /onload/i);
  assert.doesNotMatch(svg, /onclick/i);
  assert.doesNotMatch(svg, /steal/);
  assert.equal(warnings.length >= 2, true);
});

test("foreignObject is removed", () => {
  const { svg } = sanitizeSvg(
    "<svg><foreignObject><body><img src=x onerror=alert(1)></body></foreignObject></svg>",
  );
  assert.doesNotMatch(svg, /foreignObject/i);
  assert.doesNotMatch(svg, /onerror/i);
});

test("javascript: hrefs are stripped but fragment hrefs survive", () => {
  const bad = sanitizeSvg('<svg><a href="javascript:alert(1)"><circle r="1"/></a></svg>');
  assert.doesNotMatch(bad.svg, /javascript:/i);
  const ok = sanitizeSvg('<svg><path d="M0 0" fill="url(#grad)" id="p"/></svg>');
  assert.match(ok.svg, /id="p"/);
});

test("use and image elements are removed — they can pull in remote content", () => {
  const { svg } = sanitizeSvg(
    '<svg><use href="https://evil.test/x.svg#a"/><image href="https://evil.test/x.png"/><circle r="1"/></svg>',
  );
  assert.doesNotMatch(svg, /<use/i);
  assert.doesNotMatch(svg, /<image/i);
  assert.match(svg, /<circle/);
});

test("a style element is removed", () => {
  const { svg } = sanitizeSvg("<svg><style>* { background: url(evil) }</style><circle r=\"1\"/></svg>");
  assert.doesNotMatch(svg, /<style/i);
});

test("input with no svg root yields empty output and a warning", () => {
  const { svg, warnings } = sanitizeSvg("<div>not an svg</div>");
  assert.equal(svg, "");
  assert.equal(warnings.length, 1);
});

test("a diagram fence becomes a DiagramBlock with sanitised svg and hotspots", () => {
  const result = parseLessonMarkdown(
    "## The eye\n\nLight enters here.\n\n" +
      [
        ":::diagram",
        "Title: The human eye",
        "Caption: The path light takes.",
        '<svg viewBox="0 0 200 120"><circle cx="10" cy="10" r="5"/></svg>',
        "Hotspot: Cornea @ 20,50 — Bends incoming light.",
        "Hotspot: Retina — Where the image forms.",
        ":::",
      ].join("\n"),
  );
  assert.deepEqual(result.errors, []);
  const block = result.blocks[1] as DiagramBlock;
  assert.equal(block.type, "diagram");
  assert.equal(block.title, "The human eye");
  assert.equal(block.caption, "The path light takes.");
  assert.match(block.svg, /<svg/);
  assert.equal(block.hotspots.length, 2);
  assert.equal(block.hotspots[0].label, "Cornea");
  assert.equal(block.hotspots[0].text, "Bends incoming light.");
  assert.equal(block.hotspots[0].x, 20);
  assert.equal(block.hotspots[0].y, 50);
  assert.equal(block.hotspots[1].x, undefined);
});

test("a diagram whose svg is dangerous still parses, with warnings", () => {
  const result = parseLessonMarkdown(
    "## D\n\nText.\n\n:::diagram\n<svg onload=\"x()\"><script>y()</script><circle r=\"1\"/></svg>\n:::",
  );
  const block = result.blocks[1] as DiagramBlock;
  assert.doesNotMatch(block.svg, /onload/i);
  assert.doesNotMatch(block.svg, /script/i);
  assert.equal(result.warnings.length >= 2, true);
});

test("a diagram fence with no svg is an error", () => {
  const result = parseLessonMarkdown("## D\n\nText.\n\n:::diagram\nTitle: Nothing here\n:::");
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0].message, /svg/i);
});

// Property-based check for the sanitiser's security invariant, used by the
// regression tests below instead of pinning the exact shape of one payload's
// output. A payload defeats the sanitiser if either holds:
//
//   1. any tag name reaches the output that is not on the element allowlist
//      — i.e. sanitizeSvg's own allowlist, duplicated here so the test does
//      not depend on the module exporting its internals; or
//
//   2. sanitising the output *again* raises any new warning. A regex like
//      `/on\w+\s*=/` cannot tell a live handler apart from the same text
//      sitting inertly inside an escaped attribute value (e.g.
//      `id="x&quot; onclick=&quot;..."` legitimately contains the
//      substring "onclick=" without being exploitable) — that produced a
//      false positive during review. Feeding sanitizeSvg's own output back
//      into itself does not have that problem: if any handler, href or
//      element were still live (a genuine, well-formed attribute or tag),
//      the scanner would recognise and strip it on the second pass too,
//      raising a warning. (The output is not required to be byte-identical
//      on a second pass — escaping is not idempotent by itself, e.g. a
//      literal "&" inside an already-escaped value legitimately becomes
//      "&amp;" again next time, which is over-escaping, not a bug. What
//      must never happen is the second pass finding something to remove.)
const SANITISER_ELEMENT_ALLOWLIST = new Set([
  "svg", "g", "path", "circle", "ellipse", "rect", "line", "polyline",
  "polygon", "text", "tspan", "defs", "marker", "lineargradient",
  "radialgradient", "stop", "title", "desc",
]);
function assertSanitised(svg: string) {
  for (const match of svg.matchAll(/<\/?([a-zA-Z][a-zA-Z0-9-]*)/g)) {
    const name = match[1].toLowerCase();
    assert.equal(
      SANITISER_ELEMENT_ALLOWLIST.has(name),
      true,
      `disallowed tag <${match[1]}> survived sanitisation: ${svg}`,
    );
  }
  const again = sanitizeSvg(svg);
  assert.deepEqual(
    again.warnings,
    [],
    `re-sanitising this output found something to remove — it was still live: ${JSON.stringify(again.warnings)}`,
  );
}

test("a quote embedded in a single-quoted attribute value cannot break out and inject a live handler", () => {
  // A single-quoted attribute value may legally contain a literal double
  // quote. If that character were written back out unescaped into our
  // reconstructed (always double-quoted) attribute, the rest of the value
  // would reappear as unfiltered markup — e.g. a live onclick handler that
  // never passed through the "on"-prefix check.
  const { svg } = sanitizeSvg(
    `<svg><circle id='x" onclick="alert(1)" y="' r="1"/></svg>`,
  );
  assertSanitised(svg);
  // "onclick" may still appear as inert escaped text inside the id value —
  // what matters is that it is never a live, unescaped attribute again.
  assert.doesNotMatch(svg, /"\s+onclick="/i);
  assert.match(svg, /&quot;/);
});

test("an unpaired quote inside an unquoted attribute value cannot desync the tag walk", () => {
  // Unquoted HTML attribute values may legally contain a stray `'` or `"` —
  // browsers treat them as ordinary characters there. A regex-based walk
  // that requires every quote to pair up fails to match the whole tag when
  // it hits one, and (if implemented as a bare String.replace) leaves the
  // entire unmatched tag in the output untouched — event handlers included,
  // with zero warnings. sanitizeSvg must fail closed on this, not fail open.
  const payloads = [
    '<svg viewBox="0 0 200 120"><rect width="200" height="120" fill=#fff\' onmouseover="alert(document.cookie)"/></svg>',
    `<svg><circle onload="alert(1)" fill=it's/></svg>`,
    `<svg><text font-family=it's onclick="alert(1)">hi</text></svg>`,
    `<svg><circle onload="alert(1)" id=a'b /><circle r="1"/></svg>`,
  ];
  for (const payload of payloads) {
    const { svg, warnings } = sanitizeSvg(payload);
    assertSanitised(svg);
    assert.equal(warnings.length >= 1, true, `expected a warning for: ${payload}`);
  }
});

test("removing one hostile element cannot splice the surrounding text into another", () => {
  // `<scr<use/>ipt>` is not literally "<script>" until the embedded
  // `<use/>` is removed — at which point "<scr" and "ipt>" become adjacent
  // and read as "<script>". A hostile-element pass that scans for each tag
  // name once, in a fixed order, can miss a match that is only created by
  // an earlier removal. The pass must run to a fixed point.
  const { svg, warnings } = sanitizeSvg(
    "<svg><scr<use/>ipt>alert(1)</scr<use/>ipt></svg>",
  );
  assertSanitised(svg);
  assert.doesNotMatch(svg, /alert/);
  assert.equal(warnings.length >= 1, true);
});

// ─── Task 4: auto-split at the card cap, and lint integration ──────────

const WORD = "word ";

test("a concept section over the card cap splits at paragraph boundaries", () => {
  const para = WORD.repeat(80).trim();
  const result = parseLessonMarkdown(`## Long\n\n${para}\n\n${para}`);
  assert.equal(result.blocks.length, 2);
  assert.equal(result.blocks[0].type, "concept");
  assert.equal(result.blocks[1].type, "concept");
  for (const block of result.blocks) {
    assert.ok(blockWordCount(block) <= MAX_CARD_WORDS);
  }
});

test("the split keeps the heading on the first card only", () => {
  const para = WORD.repeat(80).trim();
  const result = parseLessonMarkdown(`## Long\n\n${para}\n\n${para}`);
  assert.equal((result.blocks[0] as { title?: string }).title, "Long");
  assert.equal((result.blocks[1] as { title?: string }).title, undefined);
});

test("a split emits a warning naming the heading and the card count", () => {
  const para = WORD.repeat(80).trim();
  const result = parseLessonMarkdown(`## Long\n\n${para}\n\n${para}`);
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0].message, /Long/);
  assert.match(result.warnings[0].message, /2/);
});

test("a section under the cap is never split", () => {
  const result = parseLessonMarkdown("## Short\n\nOne.\n\nTwo.\n\nThree.");
  assert.equal(result.blocks.length, 1);
});

test("one unsplittable over-long paragraph stays whole and fails the lint", () => {
  const giant = WORD.repeat(MAX_CARD_WORDS + 40).trim();
  const result = validateLessonMarkdown(`## Giant\n\n${giant}`);
  assert.equal(result.blocks.length, 1);
  assert.ok(result.errors.some((e) => /words/.test(e.message)));
});

test("validateLessonMarkdown merges lint issues into errors", () => {
  // Valid syntax, but no knowledge check — a lint rule, not a parse rule.
  const result = validateLessonMarkdown("## A\n\nSome text.");
  assert.deepEqual(parseLessonMarkdown("## A\n\nSome text.").errors, []);
  assert.ok(result.errors.some((e) => /knowledge check/i.test(e.message)));
});

test("a complete, well-formed lesson validates with no errors", () => {
  const source = [
    "---",
    "title: Newton's First Law",
    "estimatedMinutes: 20",
    "---",
    "",
    "## What the law says",
    "",
    "An object stays at rest or in uniform motion unless a net force acts on it.",
    "",
    ":::example",
    "Problem: A book rests on a table. Why does it not move?",
    "Step: Identify the forces: weight down, normal force up.",
    "Step: They are equal and opposite, so the net force is zero.",
    "Answer: With zero net force, the book stays at rest.",
    ":::",
    "",
    ":::tip",
    "Exam: WAEC",
    "Say 'net force', not 'force' — the distinction earns the mark.",
    ":::",
    "",
    ":::check",
    "Q: A car moves at constant velocity. What is the net force on it?",
    "A) Zero",
    "B) Equal to its weight",
    "C) Equal to its momentum",
    "Correct: A",
    "Why: Constant velocity means no acceleration, so no net force.",
    ":::",
  ].join("\n");
  const result = validateLessonMarkdown(source);
  assert.deepEqual(result.errors, []);
  assert.equal(result.blocks.length, 4);
  assert.equal(result.meta.title, "Newton's First Law");
});

// ─── Carried fix A: hostile-element removal must not be quadratic ──────
//
// A precheck that only skips a hostile name when *no* closing tag for it
// exists anywhere in the string is not enough: one closing tag anywhere —
// even sitting before every opening occurrence — re-enables a naive
// open...close paired regex's quadratic retry. These payloads all put the
// closing tag *before* the flood of opens (or omit it, or use only
// self-closing forms), because "no closing tag at all" alone is the one
// shape a weak fix can special-case without actually being linear.

test("hostile-element removal handles many unterminated hostile starts in well under a second", () => {
  const start = Date.now();
  const { svg } = sanitizeSvg("<svg>" + "<script ".repeat(25000) + "</svg>");
  const elapsed = Date.now() - start;
  assertSanitised(svg);
  assert.ok(elapsed < 2000, `expected well under 2000ms, took ${elapsed}ms`);
});

test("hostile-element removal handles many self-closing hostile tags in well under a second", () => {
  const start = Date.now();
  const { svg } = sanitizeSvg("<svg>" + "<use/>".repeat(20000) + "</svg>");
  const elapsed = Date.now() - start;
  assertSanitised(svg);
  assert.ok(elapsed < 2000, `expected well under 2000ms, took ${elapsed}ms`);
});

test("a closing tag positioned before a flood of opens does not resurrect the quadratic path (style)", () => {
  const start = Date.now();
  const { svg } = sanitizeSvg("<svg>" + "</style>" + "<style ".repeat(25000) + "</svg>");
  const elapsed = Date.now() - start;
  assertSanitised(svg);
  assert.ok(elapsed < 2000, `expected well under 2000ms, took ${elapsed}ms`);
});

test("a closing tag positioned before a flood of opens does not resurrect the quadratic path (script)", () => {
  const start = Date.now();
  const { svg } = sanitizeSvg("<svg>" + "</script>" + "<script ".repeat(25000) + "</svg>");
  const elapsed = Date.now() - start;
  assertSanitised(svg);
  assert.ok(elapsed < 2000, `expected well under 2000ms, took ${elapsed}ms`);
});

test(
  "doubling the closing-tag-before-opens payload does not roughly quadruple the time",
  // Defense-in-depth alongside the absolute-ceiling bail below: node:test
  // cannot preempt a synchronous, CPU-bound call mid-execution, so this
  // cannot interrupt a genuinely catastrophic regression already in
  // progress — but it caps how long a *stalled* test (e.g. one that never
  // returns due to an actual infinite loop, as opposed to "merely" slow)
  // can hold up the suite, rather than hanging until the CI job's own
  // timeout with zero diagnostic.
  { timeout: 30_000 },
  () => {
    // A property test, not a fixture pin: this catches a future reshape that
    // is fast on the exact payloads above but still quadratic in general,
    // which a literal-payload timing test cannot.
    //
    // Timing at millisecond scale is inherently noisy: at the previous sizes
    // (80k/160k opens) both runs completed in single-digit-to-tens of
    // milliseconds, where GC pauses and allocation jitter dominate the
    // measurement rather than the algorithm's actual complexity — five runs
    // of this exact test in one process produced ratios of 9.8 / 1.4 / 0.9 /
    // 0.1 / 3.0, occasionally exceeding even an 8x bound. Two changes make
    // this stable: (1) sizes large enough that the *small* run alone takes
    // at least ~50ms, so a few milliseconds of noise is a small fraction of
    // the signal, and (2) a best-of-3 measurement per size, which discards
    // GC/scheduler hiccups on any one attempt while still reporting the
    // fastest — and therefore most representative — real execution time.
    const build = (n: number) => "</script>" + "<script ".repeat(n) + "</svg>";
    const small = build(1_000_000);
    const large = build(2_000_000); // 2x the input

    // Warm up the JIT on this code path before timing either run —
    // otherwise the *first* call absorbs one-time compilation cost, which
    // lands on whichever size runs first and makes the ratio noisy either
    // direction.
    sanitizeSvg(build(1000));

    function bestOf3(run: () => void): number {
      let best = Infinity;
      for (let i = 0; i < 3; i++) {
        const t0 = process.hrtime.bigint();
        run();
        const t1 = process.hrtime.bigint();
        const elapsedMs = Number(t1 - t0) / 1e6;
        if (elapsedMs < best) best = elapsedMs;
      }
      return best;
    }

    const smallElapsed = bestOf3(() => sanitizeSvg(small));

    // Fail fast, and cheaply, on a regression before spending a second,
    // larger-payload measurement to characterise it. A healthy run finishes
    // in well under a second (measured 50-100ms); a return to quadratic at
    // this payload size would run for hours (extrapolating from the ~17.5s
    // measured at 25,000 opens for the naive precheck this suite guards
    // against, scaled by the ~1,600x this payload is bigger). 3 seconds is
    // generous headroom over the healthy case while bailing long before that
    // blowup — and before doubling the cost by also running `large`.
    assert.ok(
      smallElapsed < 3000,
      `expected the small run well under 3000ms, took ${smallElapsed.toFixed(2)}ms`,
    );

    const largeElapsed = bestOf3(() => sanitizeSvg(large));

    // Linear predicts ~2x; quadratic predicts ~4x. With the noise floor
    // above handled, 6x is enough headroom for remaining CI variance while
    // still failing hard on a return to quadratic (which lands closer to
    // 20-40x at this size ratio in practice).
    assert.ok(
      largeElapsed < smallElapsed * 6,
      `expected roughly linear scaling, got ${smallElapsed.toFixed(2)}ms -> ${largeElapsed.toFixed(2)}ms`,
    );
  },
);

// ─── Carried fix B: unquoted attribute values must not swallow a trailing / ──

test("a self-closing tag's unquoted attribute value does not swallow the slash", () => {
  const { svg, warnings } = sanitizeSvg("<svg><circle r=1/></svg>");
  assertSanitised(svg);
  assert.doesNotMatch(svg, /r="1\/"/);
  assert.match(svg, /<circle r="1"\/>/);
  assert.deepEqual(warnings, []);
});

test("a self-closing tag's unquoted color value does not swallow the slash", () => {
  const { svg, warnings } = sanitizeSvg("<svg><circle fill=red/></svg>");
  assertSanitised(svg);
  assert.doesNotMatch(svg, /fill="red\/"/);
  assert.match(svg, /<circle fill="red"\/>/);
  assert.deepEqual(warnings, []);
});
