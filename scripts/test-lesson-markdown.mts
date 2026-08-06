import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseLessonMarkdown, sanitizeSvg, validateLessonMarkdown } from "../src/lib/lesson-markdown";
import { stripAnswerMarker, stripLessonNotePrefix } from "../src/lib/lesson-markdown/natural";
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

test("a split whose reveal pushes a card back over the cap says so in the warning", () => {
  // The split budget counts paragraph words only, so the card carrying the
  // reveal can land over the cap even though the split "succeeded". That is
  // deliberate (folding the reveal in would move the split points of every
  // existing draft) and it fails closed — the lint rejects the over-cap card.
  // What must not happen is the two disagreeing: a success-toned warning
  // beside an error naming a synthetic card id the author never wrote.
  const para = WORD.repeat(80).trim();
  const reveal = WORD.repeat(60).trim();
  const result = validateLessonMarkdown(
    `## Long\n\n${para}\n\n${para}\n\n### Reveal\n\n${reveal}`,
  );

  // The split did happen, and the last card really is over the cap.
  assert.equal(result.blocks.length, 2);
  assert.ok(blockWordCount(result.blocks[1]) > MAX_CARD_WORDS);
  // The lint catches it (fail-closed), naming the synthetic id...
  assert.ok(result.errors.some((e) => /words/.test(e.message)));
  // ...and the warning, which names the author's own heading, no longer reads
  // as an unqualified success.
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0].message, /Long/);
  assert.match(result.warnings[0].message, /still over the limit/);
});

test("a split that stays under the cap keeps the plain, unqualified warning", () => {
  const para = WORD.repeat(80).trim();
  const result = parseLessonMarkdown(`## Long\n\n${para}\n\n${para}`);
  assert.equal(result.warnings.length, 1);
  assert.doesNotMatch(result.warnings[0].message, /still over the limit/);
  assert.match(result.warnings[0].message, /split into 2 cards\.$/);
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
// Two distinct quadratic traps have been found here, and a payload that
// exercises one can completely mask the other:
//
// 1. A precheck that only skips a hostile name when *no* closing tag for it
//    exists anywhere in the string is not enough: one closing tag anywhere —
//    even sitting before every opening occurrence — re-enables a naive
//    open...close paired regex's quadratic retry. Hence the payloads that put
//    the closing tag *before* the flood of opens.
//
// 2. `matchAll(/<(names)\b[^>]*>/g)` is quadratic whenever the opens have **no
//    `>` after them at all**: each of the N opens scans `[^>]*` to end of input
//    and fails, and a failed attempt consumes nothing, so the engine retries
//    one character later. Every earlier version of these tests ended its
//    payload in `</svg>`; that single trailing `>` let the *first* open match
//    straight through to it and swallow the whole remainder in one successful
//    match, so the pass timed one regex match instead of the algorithm and the
//    bug was invisible for three review rounds. Measured on the broken
//    implementation: the `</svg>`-terminated payload 5ms, the identical
//    payload with those six characters removed 9,468ms.
//
// So: payloads here deliberately do **not** end in `>`, with one
// trailing-`>` case kept so both shapes stay pinned.

test("hostile-element removal handles many unterminated hostile starts in well under a second", () => {
  const start = Date.now();
  const { svg } = sanitizeSvg("<svg>" + "<script ".repeat(25000) + " the end.");
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
  const { svg } = sanitizeSvg("<svg>" + "</style>" + "<style ".repeat(25000) + " the end.");
  const elapsed = Date.now() - start;
  assertSanitised(svg);
  assert.ok(elapsed < 2000, `expected well under 2000ms, took ${elapsed}ms`);
});

test("a closing tag positioned before a flood of opens does not resurrect the quadratic path (script)", () => {
  const start = Date.now();
  const { svg } = sanitizeSvg("<svg>" + "</script>" + "<script ".repeat(25000) + " the end.");
  const elapsed = Date.now() - start;
  assertSanitised(svg);
  assert.ok(elapsed < 2000, `expected well under 2000ms, took ${elapsed}ms`);
});

test("the same flood terminated by a trailing > stays fast too", () => {
  // The masked shape, kept so a future fix cannot be fast only on the
  // unterminated case and quadratic on this one.
  const start = Date.now();
  const { svg } = sanitizeSvg("<svg>" + "</style>" + "<style ".repeat(25000) + "</svg>");
  const elapsed = Date.now() - start;
  assertSanitised(svg);
  assert.ok(elapsed < 2000, `expected well under 2000ms, took ${elapsed}ms`);
});

test("a flood of spliced, never-closed hostile opens stays fast", () => {
  // No `>` anywhere in the input at all, and three hostile names interleaved
  // so no single-name shortcut helps. 30,510ms on the broken implementation.
  const start = Date.now();
  const { svg } = sanitizeSvg("<svg>" + "<use <image <set ".repeat(12000));
  const elapsed = Date.now() - start;
  assertSanitised(svg);
  assert.ok(elapsed < 2000, `expected well under 2000ms, took ${elapsed}ms`);
});

test("a flood of hostile closes with no > to terminate them stays fast", () => {
  const start = Date.now();
  const { svg } = sanitizeSvg("<svg>" + ("</use" + "   ").repeat(20000));
  const elapsed = Date.now() - start;
  assertSanitised(svg);
  assert.ok(elapsed < 2000, `expected well under 2000ms, took ${elapsed}ms`);
});

test("a flood of bare < with a hostile name only at the very end stays fast", () => {
  const start = Date.now();
  const { svg } = sanitizeSvg("<svg>" + "<".repeat(100000) + "use/>");
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
    // The tail is deliberately **not** `</svg>`, and deliberately contains no
    // `>` at all. With a trailing `>` the first open swallows the entire
    // remainder in one successful match and this measures a single regex
    // match rather than the algorithm — which is why this property test,
    // despite running at 1M/2M opens, was incapable of failing on the
    // quadratic-on-failed-match bug it was meant to catch.
    const build = (n: number) => "</script>" + "<script ".repeat(n) + " the end.";
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
    // in well under a second (measured ~110ms on this shape); a return to quadratic at
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

// ─── The 64-pass fixed-point cap: its residual must be inert ───────────

test("a nested splice deeper than the fixed-point cap leaves nothing live", () => {
  // `stripHostileOnce` runs to a fixed point because removing one hostile tag
  // can splice a new one into existence (`<scr<use/>ipt>` only reads as
  // `<script>` once the `<use/>` is gone). That loop is capped at 64 passes so
  // a pathological nesting cannot make it superlinear. This pins the claim the
  // cap's comment makes about the *residual*: a payload deep enough to exhaust
  // the cap must still leave no disallowed tag behind, because pass 2 is
  // fail-closed on every `<` regardless of what pass 1 left. 70 > 64, so this
  // genuinely exhausts it.
  const nest = (k: number): string => (k === 0 ? "<use/>" : "<us" + nest(k - 1) + "e/>");
  const deep = nest(70);
  const payload = `<svg><scr${deep}ipt>alert(1)</scr${deep}ipt></svg>`;

  const { svg } = sanitizeSvg(payload);
  // No disallowed tag survived, and re-sanitising is a fixed point (i.e. the
  // output contains nothing left to remove — it is not "still live").
  assertSanitised(svg);
  assert.doesNotMatch(svg, /<\s*\/?\s*(script|use|style|image|set|iframe)/i);
});

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

// ─── Task 2: document header and horizontal rules ───────────────────────

test("a Lesson Note: prefix is stripped from the document title", () => {
  const result = parseLessonMarkdown(
    "# Physics Lesson Note: Measurement and Units\n\n## Intro\n\nText.",
  );
  assert.equal(result.meta.title, "Measurement and Units");
});

test("a title whose colon is not lesson-note boilerplate is left alone", () => {
  const result = parseLessonMarkdown("# Osmosis: A Closer Look\n\n## Intro\n\nText.");
  assert.equal(result.meta.title, "Osmosis: A Closer Look");
});

test("the info line under the H1 becomes docInfo, not a block", () => {
  const result = parseLessonMarkdown(
    [
      "# Physics Lesson Note: Measurement and Units",
      "**Class:** SSS1 | **Term:** First Term | **Curriculum Reference:** NERDC",
      "",
      "## Intro",
      "",
      "Text.",
    ].join("\n"),
  );
  assert.deepEqual(result.meta.docInfo, {
    Class: "SSS1",
    Term: "First Term",
    "Curriculum Reference": "NERDC",
  });
  assert.equal(result.blocks.length, 1);
  assert.equal((result.blocks[0] as ConceptBlock).title, "Intro");
});

test("a sentence with one bold run under the H1 stays prose", () => {
  const result = parseLessonMarkdown(
    ["# Title", "This lesson is **important** for WAEC.", "", "## Intro", "", "Text."].join("\n"),
  );
  assert.equal(result.meta.docInfo, undefined);
  assert.equal(result.blocks.length, 2);
  assert.equal((result.blocks[0] as ConceptBlock).text, "This lesson is **important** for WAEC.");
});

test("an info-shaped line deeper in the body stays prose", () => {
  const result = parseLessonMarkdown(
    ["# Title", "", "## Intro", "", "**Note:** read this | **Also:** and this"].join("\n"),
  );
  assert.equal(result.meta.docInfo, undefined);
  assert.equal(result.blocks.length, 1);
  assert.match((result.blocks[0] as ConceptBlock).text, /\*\*Note:\*\* read this/);
});

test("horizontal rules are dropped from card text", () => {
  const result = parseLessonMarkdown("## A\n\nFirst.\n\n---\n\nSecond.");
  const block = result.blocks[0] as ConceptBlock;
  assert.ok(!block.text.includes("---"), `rule leaked into text: ${block.text}`);
  assert.match(block.text, /First\./);
  assert.match(block.text, /Second\./);
});

// ─── Fix round 1: parseInfoLine must require exactly one colon ─────────

test("a bolded lead phrase with no colon under the H1 stays prose, not docInfo", () => {
  const result = parseLessonMarkdown(
    [
      "# Title",
      "**Warning** please review carefully before starting.",
      "",
      "## Intro",
      "",
      "Text.",
    ].join("\n"),
  );
  assert.equal(result.meta.docInfo, undefined);
  assert.equal(result.blocks.length, 2);
  assert.equal(
    (result.blocks[0] as ConceptBlock).text,
    "**Warning** please review carefully before starting.",
  );
});

test("the colon-outside-the-bold form still parses as docInfo", () => {
  const result = parseLessonMarkdown(
    [
      "# Title",
      "**Class**: SSS1 | **Term**: First Term",
      "",
      "## Intro",
      "",
      "Text.",
    ].join("\n"),
  );
  assert.deepEqual(result.meta.docInfo, { Class: "SSS1", Term: "First Term" });
});

test("the colon-inside-the-bold form still parses as docInfo", () => {
  const result = parseLessonMarkdown(
    [
      "# Title",
      "**Class:** SSS1 | **Term:** First Term",
      "",
      "## Intro",
      "",
      "Text.",
    ].join("\n"),
  );
  assert.deepEqual(result.meta.docInfo, { Class: "SSS1", Term: "First Term" });
});

// ─── Task 3: quiz recogniser ─────────────────────────────────────────────

const QUIZ_LESSON = [
  "## Overview",
  "",
  "Measurement compares a quantity with a standard.",
  "",
  "## Quiz (10 Questions)",
  "",
  "1. Measurement involves comparing a quantity with a:",
  "   a) friend's estimate",
  "   b) known standard (unit) \u2714",
  "   c) random guess",
  "",
  "2. The SI unit of length is the:",
  "   a) kilometre",
  "   b) metre \u2713",
  "",
  "3. Convert 3,000 g to kilograms. *(Short answer: 3 kg)*",
].join("\n");

test("quiz questions with options become check blocks", () => {
  const result = parseLessonMarkdown(QUIZ_LESSON);
  assert.deepEqual(result.errors, []);
  const checks = result.blocks.filter((b) => b.type === "check") as CheckBlock[];
  assert.equal(checks.length, 2);

  assert.equal(checks[0].question, "Measurement involves comparing a quantity with a:");
  assert.deepEqual(checks[0].options, {
    A: "friend's estimate",
    B: "known standard (unit)",
    C: "random guess",
  });
  assert.equal(checks[0].answer, "B");
  assert.equal(checks[0].afterCard, "overview-1");
  assert.equal(checks[1].answer, "B");
});

test("the answer marker is stripped from the stored option text", () => {
  const result = parseLessonMarkdown(QUIZ_LESSON);
  const check = result.blocks.find((b) => b.type === "check") as CheckBlock;
  assert.equal(check.options.B, "known standard (unit)");
  assert.ok(!JSON.stringify(check.options).includes("\u2714"));
});

test("every accepted answer marker works", () => {
  for (const marker of ["\u2714", "\u2713", "\u2705", "\u2611", "*", "**"]) {
    const result = parseLessonMarkdown(
      ["## A", "", "Text.", "", "## Quiz", "", "1. Q?", `   a) wrong`, `   b) right ${marker}`].join("\n"),
    );
    assert.deepEqual(result.errors, [], `marker ${marker} produced errors`);
    const check = result.blocks.find((b) => b.type === "check") as CheckBlock;
    assert.equal(check.answer, "B", `marker ${marker} did not mark option B`);
    assert.equal(check.options.B, "right", `marker ${marker} was not stripped`);
  }
});

test("a short-answer question becomes a concept card with a reveal", () => {
  const result = parseLessonMarkdown(QUIZ_LESSON);
  const reveal = result.blocks.find(
    (b) => b.type === "concept" && (b as ConceptBlock).reveal,
  ) as ConceptBlock;
  assert.equal(reveal.text, "Convert 3,000 g to kilograms.");
  assert.equal(reveal.reveal, "3 kg");
  assert.equal(reveal.id, "short-answer-1");
});

test("a short answer containing punctuation is captured whole", () => {
  const result = parseLessonMarkdown(
    [
      "## A",
      "",
      "Text.",
      "",
      "## Quiz",
      "",
      "1. Explain the difference. *(Short answer: Fundamental cannot be broken down, e.g., mass; derived are combinations, e.g., speed = distance/time)*",
    ].join("\n"),
  );
  const reveal = result.blocks.find(
    (b) => b.type === "concept" && (b as ConceptBlock).reveal,
  ) as ConceptBlock;
  assert.equal(
    reveal.reveal,
    "Fundamental cannot be broken down, e.g., mass; derived are combinations, e.g., speed = distance/time",
  );
});

test("a quiz question with no marked option is an error naming the line", () => {
  const result = parseLessonMarkdown(
    ["## A", "", "Text.", "", "## Quiz", "", "1. Q?", "   a) one", "   b) two"].join("\n"),
  );
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0].message, /Question 1 has no correct option/);
  assert.equal(result.errors[0].line, 7);
});

test("a quiz question with two marked options is an error", () => {
  const result = parseLessonMarkdown(
    ["## A", "", "Text.", "", "## Quiz", "", "1. Q?", "   a) one \u2714", "   b) two \u2714"].join("\n"),
  );
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0].message, /Question 1 marks 2 correct options/);
});

test("a quiz question with one option is an error", () => {
  const result = parseLessonMarkdown(
    ["## A", "", "Text.", "", "## Quiz", "", "1. Q?", "   a) only \u2714"].join("\n"),
  );
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0].message, /Question 1 has only one option/);
});

test("a quiz question with neither options nor a short answer is an error", () => {
  const result = parseLessonMarkdown(
    ["## A", "", "Text.", "", "## Quiz", "", "1. Just a sentence."].join("\n"),
  );
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0].message, /has no options and no/);
});

test("prose above the first quiz question is kept as a titled card", () => {
  const result = parseLessonMarkdown(
    [
      "## A", "", "Text.", "",
      "## Quiz", "", "Answer all questions in 10 minutes.", "",
      "1. Q?", "   a) one", "   b) two \u2714",
    ].join("\n"),
  );
  assert.deepEqual(result.errors, []);
  const rubric = result.blocks.find(
    (b) => b.type === "concept" && (b as ConceptBlock).title === "Quiz",
  ) as ConceptBlock;
  assert.equal(rubric.text, "Answer all questions in 10 minutes.");
});

test("a quiz section ends at the next heading", () => {
  const result = parseLessonMarkdown(
    [
      "## A", "", "Text.", "",
      "## Quiz", "", "1. Q?", "   a) one", "   b) two \u2714", "",
      "## Resources", "", "A book.",
    ].join("\n"),
  );
  assert.deepEqual(result.errors, []);
  const last = result.blocks[result.blocks.length - 1] as ConceptBlock;
  assert.equal(last.title, "Resources");
  assert.equal(last.text, "A book.");
});

test("a quiz lesson passes the authoring lint", () => {
  const result = validateLessonMarkdown(QUIZ_LESSON);
  assert.deepEqual(result.errors, []);
});

// ─── Task 3 fix round 1: stripAnswerMarker must not false-positive on ──────
// legitimate bold/italic text, and a duplicate option key must error ───────

test("stripAnswerMarker: a check glyph is always a marker", () => {
  const result = stripAnswerMarker("Mass \u2714");
  assert.equal(result.marked, true);
  assert.equal(result.text, "Mass");
});

test("stripAnswerMarker: an unbalanced trailing single asterisk is a marker", () => {
  const result = stripAnswerMarker("Mass *");
  assert.equal(result.marked, true);
  assert.equal(result.text, "Mass");
});

test("stripAnswerMarker: an unbalanced trailing double asterisk is a marker", () => {
  const result = stripAnswerMarker("Mass **");
  assert.equal(result.marked, true);
  assert.equal(result.text, "Mass");
});

test("stripAnswerMarker: a trailing ** that closes an earlier bold span is not a marker", () => {
  const result = stripAnswerMarker("The correct interpretation is **key**");
  assert.equal(result.marked, false);
  assert.equal(result.text, "The correct interpretation is **key**");
});

test("stripAnswerMarker: a trailing * that closes an earlier italic span is not a marker", () => {
  const result = stripAnswerMarker("The formula is 2*3*");
  assert.equal(result.marked, false);
  assert.equal(result.text, "The formula is 2*3*");
});

test("stripAnswerMarker: plain text with no trailing marker is not marked", () => {
  const result = stripAnswerMarker("plain option");
  assert.equal(result.marked, false);
  assert.equal(result.text, "plain option");
});

test("an option ending in a legitimate bold span inside a real quiz is not read as the answer", () => {
  const result = parseLessonMarkdown(
    [
      "## A", "", "Text.", "",
      "## Quiz", "",
      "1. Q?",
      "   a) The correct interpretation is **key**",
      "   b) right \u2714",
    ].join("\n"),
  );
  assert.deepEqual(result.errors, []);
  const check = result.blocks.find((b) => b.type === "check") as CheckBlock;
  assert.equal(check.answer, "B");
  assert.equal(check.options.A, "The correct interpretation is **key**");
});

test("a repeated option letter is an error naming the line, and no check block is emitted", () => {
  const result = parseLessonMarkdown(
    [
      "## A", "", "Text.", "",
      "## Quiz", "",
      "1. Q?",
      "   a) RIGHT ANSWER \u2714",
      "   a) wrong overwrite",
      "   b) other",
    ].join("\n"),
  );
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0].message, /Question 1 repeats option a\)/);
  assert.equal(result.errors[0].line, 7);
  assert.equal(result.blocks.some((b) => b.type === "check"), false);
});

const EXAMPLES_LESSON = [
  "## Overview",
  "",
  "Units matter.",
  "",
  "## Worked Examples",
  "",
  "**Example 1:** Convert 5 km to metres.",
  "**Solution:**",
  "1 km = 1,000 m",
  "5 km = 5 × 1,000 = **5,000 m**",
  "",
  "**Example 2:** A trip takes 2 hours 30 minutes. Convert to seconds.",
  "**Solution:**",
  "2 hours = 2 × 3,600 s = 7,200 s",
  "30 minutes = 30 × 60 s = 1,800 s",
  "Total = 7,200 + 1,800 = **9,000 seconds**",
].join("\n");

test("worked examples become example blocks with steps and answers", () => {
  const result = parseLessonMarkdown(EXAMPLES_LESSON);
  assert.deepEqual(result.errors, []);
  const examples = result.blocks.filter((b) => b.type === "example") as ExampleBlock[];
  assert.equal(examples.length, 2);

  assert.equal(examples[0].problem, "Convert 5 km to metres.");
  assert.deepEqual(examples[0].steps, ["1 km = 1,000 m"]);
  assert.equal(examples[0].answer, "5,000 m");
  assert.equal(examples[0].mode, "worked");

  assert.equal(examples[1].steps.length, 2);
  assert.equal(examples[1].answer, "9,000 seconds");
});

test("an unbolded final line becomes the whole answer", () => {
  const result = parseLessonMarkdown(
    ["## A", "", "T.", "", "## Worked Examples", "", "**Example 1:** Q?", "**Solution:**", "step one", "the answer is 4"].join("\n"),
  );
  const example = result.blocks.find((b) => b.type === "example") as ExampleBlock;
  assert.deepEqual(example.steps, ["step one"]);
  assert.equal(example.answer, "the answer is 4");
});

test("a one-line solution is the answer with no steps", () => {
  const result = parseLessonMarkdown(
    ["## A", "", "T.", "", "## Worked Examples", "", "**Example 1:** Q?", "**Solution:**", "**42**"].join("\n"),
  );
  const example = result.blocks.find((b) => b.type === "example") as ExampleBlock;
  assert.deepEqual(example.steps, []);
  assert.equal(example.answer, "42");
});

test("the colon may sit inside or outside the bold run", () => {
  const result = parseLessonMarkdown(
    ["## A", "", "T.", "", "## Worked Examples", "", "**Example 1**: Q?", "**Solution**:", "**7**"].join("\n"),
  );
  assert.deepEqual(result.errors, []);
  const example = result.blocks.find((b) => b.type === "example") as ExampleBlock;
  assert.equal(example.problem, "Q?");
  assert.equal(example.answer, "7");
});

test("an example with no Solution: is an error naming its line", () => {
  const result = parseLessonMarkdown(
    ["## A", "", "T.", "", "## Worked Examples", "", "**Example 1:** Q?", "some prose"].join("\n"),
  );
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0].message, /Example 1 has no \*\*Solution:\*\*/);
  assert.equal(result.errors[0].line, 7);
});

test("a worked-examples section ends at the next heading", () => {
  const result = parseLessonMarkdown(EXAMPLES_LESSON + "\n\n## After\n\nMore text.");
  const last = result.blocks[result.blocks.length - 1] as ConceptBlock;
  assert.equal(last.title, "After");
});

test("prose before the first worked example becomes a rubric card titled with the heading", () => {
  const result = parseLessonMarkdown(
    [
      "## A", "", "T.", "",
      "## Worked Examples", "",
      "Here's how to convert between units in practice:", "",
      "**Example 1:** Convert 5 km to metres.",
      "**Solution:**",
      "1 km = 1,000 m",
      "5 km = 5 × 1,000 = **5,000 m**",
    ].join("\n"),
  );
  assert.deepEqual(result.errors, []);
  const rubricIndex = result.blocks.findIndex(
    (b) => b.type === "concept" && (b as ConceptBlock).title === "Worked Examples",
  );
  assert.notEqual(rubricIndex, -1);
  const rubric = result.blocks[rubricIndex] as ConceptBlock;
  assert.equal(rubric.text, "Here's how to convert between units in practice:");

  const examples = result.blocks.filter((b) => b.type === "example") as ExampleBlock[];
  assert.equal(examples.length, 1);
  const exampleIndex = result.blocks.findIndex((b) => b.type === "example");
  assert.ok(rubricIndex < exampleIndex, "rubric card must come before the example blocks");
});

test("a worked-examples section with no preamble emits no rubric card", () => {
  const result = parseLessonMarkdown(EXAMPLES_LESSON);
  const rubric = result.blocks.find(
    (b) => b.type === "concept" && (b as ConceptBlock).title === "Worked Examples",
  );
  assert.equal(rubric, undefined);
});

test("an empty **Solution:** produces its own message naming the line", () => {
  const result = parseLessonMarkdown(
    ["## A", "", "T.", "", "## Worked Examples", "", "**Example 1:** Q?", "**Solution:**", "", "## Next", "", "More."].join("\n"),
  );
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0].message, /Example 1 has an empty \*\*Solution:\*\*/);
  assert.equal(result.errors[0].line, 7);
});

const FIXTURE = readFileSync(
  fileURLToPath(new URL("./fixtures/measurement-and-units.md", import.meta.url)),
  "utf8",
);

test("the real lesson note parses with no errors at all", () => {
  const result = validateLessonMarkdown(FIXTURE);
  assert.deepEqual(
    result.errors,
    [],
    `fixture should upload clean, got:\n${result.errors.map((e) => `  line ${e.line}: ${e.message}`).join("\n")}`,
  );
});

test("the real lesson note produces the expected block mix", () => {
  const result = validateLessonMarkdown(FIXTURE);
  const counts = result.blocks.reduce<Record<string, number>>((acc, b) => {
    acc[b.type] = (acc[b.type] ?? 0) + 1;
    return acc;
  }, {});

  assert.equal(counts.check, 7, "seven multiple-choice questions become checks");
  assert.equal(counts.example, 3, "three worked examples become example blocks");
  assert.equal(
    counts.concept,
    10,
    "ten concept cards: five body sections, the objectives, the resources, and three short-answer reveal cards",
  );

  const reveals = result.blocks.filter(
    (b) => b.type === "concept" && (b as ConceptBlock).reveal,
  );
  assert.equal(reveals.length, 3, "three short-answer questions become reveal cards");
});

test("the real lesson note's header is read, not carded", () => {
  const result = parseLessonMarkdown(FIXTURE);
  assert.equal(
    result.meta.title,
    "Measurement and Units",
    "the 'Physics Lesson Note:' prefix should be stripped from the title",
  );
  assert.equal(result.meta.docInfo?.Class, "SSS1", "docInfo should capture Class from the header line");
  assert.equal(result.meta.docInfo?.Term, "First Term", "docInfo should capture Term from the header line");

  const first = result.blocks[0] as ConceptBlock;
  assert.ok(
    !first.text.includes("**Class:**"),
    `header line leaked into the first card: ${first.text}`,
  );
});

test("every card in the real lesson note is within the word cap", () => {
  const result = parseLessonMarkdown(FIXTURE);
  for (const block of result.blocks) {
    if (block.type === "check") continue;
    const words = blockWordCount(block);
    assert.ok(words <= MAX_CARD_WORDS, `${block.id} is ${words} words`);
  }
});

test("no horizontal rule survives into the real lesson note's cards", () => {
  const result = parseLessonMarkdown(FIXTURE);
  for (const block of result.blocks) {
    if (block.type !== "concept") continue;
    assert.ok(
      !/^\s*---\s*$/m.test((block as ConceptBlock).text),
      `${block.id} still contains a rule`,
    );
  }
});

// ─── Final-fix round: trailing prose must not become the answer/an option ──

test("trailing prose after the last worked example is not read as the answer", () => {
  const result = parseLessonMarkdown(
    [
      "## A", "", "T.", "",
      "## Worked Examples", "",
      "**Example 1:** Convert 5 km to metres.",
      "**Solution:**",
      "1 km = 1,000 m",
      "5 km = **5,000 m**",
      "",
      "Try the rest of these at home before the next class.",
    ].join("\n"),
  );
  assert.deepEqual(result.errors, []);
  const example = result.blocks.find((b) => b.type === "example") as ExampleBlock;
  assert.equal(example.answer, "5,000 m");
  assert.deepEqual(example.steps, ["1 km = 1,000 m"]);

  const trailing = result.blocks.find(
    (b) => b.type === "concept" && (b as ConceptBlock).title === "Worked Examples",
  ) as ConceptBlock;
  assert.ok(trailing, "trailing prose should survive as a concept card");
  assert.equal(trailing.text, "Try the rest of these at home before the next class.");
});

test("a note after the last worked example's blank line is kept, not absorbed as a step", () => {
  const result = parseLessonMarkdown(
    [
      "## A", "", "T.", "",
      "## Worked Examples", "",
      "**Example 1:** Q?",
      "**Solution:**",
      "**42**",
      "",
      "**Note:** always show your units.",
    ].join("\n"),
  );
  assert.deepEqual(result.errors, []);
  const example = result.blocks.find((b) => b.type === "example") as ExampleBlock;
  assert.equal(example.answer, "42");
  const notes = result.blocks.filter(
    (b) => b.type === "concept" && (b as ConceptBlock).title === "Worked Examples",
  ) as ConceptBlock[];
  assert.equal(notes.length, 1);
  assert.equal(notes[0].text, "**Note:** always show your units.");
});

test("trailing prose after the last quiz question is kept as a card, not absorbed into the last option", () => {
  const result = parseLessonMarkdown(
    [
      "## A", "", "Text.", "",
      "## Quiz", "",
      "1. Q?",
      "   a) one",
      "   b) two ✔",
      "",
      "Good luck, and remember to show your working.",
    ].join("\n"),
  );
  assert.deepEqual(result.errors, []);
  const check = result.blocks.find((b) => b.type === "check") as CheckBlock;
  assert.equal(check.options.B, "two");
  assert.equal(check.answer, "B");

  const trailing = result.blocks.find(
    (b) => b.type === "concept" && (b as ConceptBlock).title === "Quiz",
  ) as ConceptBlock;
  assert.ok(trailing, "trailing prose should survive as a concept card");
  assert.equal(trailing.text, "Good luck, and remember to show your working.");
});

test("without the fix, trailing quiz prose would misdirect the error line -- with it, there is no error", () => {
  const result = parseLessonMarkdown(
    [
      "## A", "", "Text.", "",
      "## Quiz", "",
      "1. Q?",
      "   a) one",
      "   b) two ✔",
      "",
      "Good luck, and remember to show your working.",
    ].join("\n"),
  );
  assert.deepEqual(
    result.errors,
    [],
    "the ✔ marker must survive on option b -- absorbing trailing prose would strip it and report a phantom 'no correct option'",
  );
});

// ─── Finding 5: the bare "Lesson Note:" prefix ─────────────────────────────

test("stripLessonNotePrefix strips a bare 'Lesson Note:' prefix", () => {
  assert.equal(
    stripLessonNotePrefix("Lesson Note: Measurement and Units"),
    "Measurement and Units",
  );
});

test("stripLessonNotePrefix still strips a subject-qualified prefix", () => {
  assert.equal(
    stripLessonNotePrefix("Physics Lesson Notes: Measurement and Units"),
    "Measurement and Units",
  );
});

test("stripLessonNotePrefix leaves an unrelated colon title alone", () => {
  assert.equal(stripLessonNotePrefix("Osmosis: A Closer Look"), "Osmosis: A Closer Look");
});

// ─── Finding 7: a trailing "*(Answer: ...)*" must not leak into a ──────────
// multiple-choice question's visible stem ───────────────────────────────────

test("a trailing *(Answer: ...)* on a multiple-choice stem does not leak into the question", () => {
  const result = parseLessonMarkdown(
    [
      "## A", "", "Text.", "",
      "## Quiz", "",
      "1. What is the SI unit of length? *(Answer: metre)*",
      "   a) kilometre",
      "   b) metre ✔",
    ].join("\n"),
  );
  assert.deepEqual(result.errors, []);
  const check = result.blocks.find((b) => b.type === "check") as CheckBlock;
  assert.equal(check.question, "What is the SI unit of length?");
  assert.ok(!check.question.includes("Answer"), "the answer aside must not remain in the visible question");
  assert.equal(check.explanation, "metre", "the aside becomes the check's explanation rather than being discarded");
});

// ─── Regression round: the blank-line-closes rule must not corrupt cases ──
// where a blank line legitimately separates working steps, a stem from its
// options, or a stem from its short-answer aside ────────────────────────────

test("case A: a blank line between working steps is not read as a closing remark", () => {
  const result = parseLessonMarkdown(
    [
      "## A", "", "T.", "",
      "## Worked Examples", "",
      "**Example 1:** Convert 5 km to metres.",
      "**Solution:**",
      "1 km = 1,000 m",
      "",
      "5 km = **5,000 m**",
    ].join("\n"),
  );
  assert.deepEqual(result.errors, []);
  const example = result.blocks.find((b) => b.type === "example") as ExampleBlock;
  assert.deepEqual(example.steps, ["1 km = 1,000 m"]);
  assert.equal(example.answer, "5,000 m");
  assert.equal(
    result.blocks.some((b) => b.type === "concept" && (b as ConceptBlock).title === "Worked Examples"),
    false,
    "no stray trailing card should be produced -- the blank line was inside the working, not after it",
  );
});

test("case B: a blank line between a quiz stem and its options does not discard the options", () => {
  const result = parseLessonMarkdown(
    [
      "## A", "", "Text.", "",
      "## Quiz", "",
      "1. What is the SI unit of length?",
      "",
      "   a) kilometre",
      "   b) metre ✔",
    ].join("\n"),
  );
  assert.deepEqual(result.errors, []);
  const check = result.blocks.find((b) => b.type === "check") as CheckBlock;
  assert.ok(check, "the question must still become a check block, not a hard error");
  assert.deepEqual(check.options, { A: "kilometre", B: "metre" });
  assert.equal(check.answer, "B");
});

test("case C: a blank line before a *(Short answer: ...)* aside on its own line does not discard it", () => {
  const result = parseLessonMarkdown(
    [
      "## A", "", "Text.", "",
      "## Quiz", "",
      "1. Convert 3,000 g to kilograms.",
      "",
      "*(Short answer: 3 kg)*",
    ].join("\n"),
  );
  assert.deepEqual(result.errors, []);
  const reveal = result.blocks.find(
    (b) => b.type === "concept" && (b as ConceptBlock).reveal,
  ) as ConceptBlock;
  assert.ok(reveal, "the short answer must still be recognised, not reported as missing");
  assert.equal(reveal.text, "Convert 3,000 g to kilograms.");
  assert.equal(reveal.reveal, "3 kg");
});

test("documented residual: an unbolded final answer followed by a blank line and a remark still reads the remark as the answer", () => {
  const result = parseLessonMarkdown(
    [
      "## A", "", "T.", "",
      "## Worked Examples", "",
      "**Example 1:** Q?",
      "**Solution:**",
      "the answer is 4",
      "",
      "A closing remark.",
    ].join("\n"),
  );
  assert.deepEqual(result.errors, []);
  const example = result.blocks.find((b) => b.type === "example") as ExampleBlock;
  assert.deepEqual(
    example.steps,
    ["the answer is 4"],
    "with no trailing bold to close on, the blank line is skipped and the remark keeps accumulating into the working",
  );
  assert.equal(
    example.answer,
    "A closing remark.",
    "this is the accepted residual: without a bolded answer to key off, position alone still can't tell a closing remark from the true final line",
  );
});
