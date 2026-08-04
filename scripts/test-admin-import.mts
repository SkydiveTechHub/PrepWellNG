import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_IMPORT_ROWS, parseImportPayload } from "../src/lib/admin-import";

function validRow(overrides: Record<string, unknown> = {}) {
  return {
    subjectCode: "MTH",
    examType: "WAEC",
    questionText: "What is 2 + 2?",
    options: { A: "3", B: "4", C: "5", D: "6" },
    correctAnswer: "B",
    explanation: "Two plus two is four.",
    ...overrides,
  };
}

test("a valid batch parses with no errors", () => {
  const result = parseImportPayload(JSON.stringify([validRow(), validRow()]));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.total, 2);
  assert.deepEqual(result.errors, []);
});

test("a { questions: [...] } wrapper is accepted as well as a bare array", () => {
  const result = parseImportPayload(JSON.stringify({ questions: [validRow()] }));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.total, 1);
});

test("malformed JSON fails fatally rather than per-row", () => {
  const result = parseImportPayload("{ not json");
  assert.equal(result.ok, false);
});

test("a root that is neither an array nor a questions object fails fatally", () => {
  const result = parseImportPayload(JSON.stringify({ foo: 1 }));
  assert.equal(result.ok, false);
});

test("an empty array fails fatally — there is nothing to import", () => {
  const result = parseImportPayload("[]");
  assert.equal(result.ok, false);
});

test("one bad row is reported by index without rejecting the good ones", () => {
  const raw = JSON.stringify([
    validRow(),
    validRow({ correctAnswer: undefined }),
    validRow(),
  ]);
  const result = parseImportPayload(raw);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.rows.length, 2);
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].index, 1);
  assert.equal(result.errors[0].field, "correctAnswer");
});

test("an objective row whose correct answer is not an option is caught here", () => {
  // Same invariant as the single-question form — checked before the network,
  // so the admin sees it next to the row that caused it.
  const result = parseImportPayload(
    JSON.stringify([validRow({ correctAnswer: "Z" })]),
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].field, "correctAnswer");
});

test("a batch over the row cap fails fatally and names the cap", () => {
  const raw = JSON.stringify(
    Array.from({ length: MAX_IMPORT_ROWS + 1 }, () => validRow()),
  );
  const result = parseImportPayload(raw);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.fatal, new RegExp(String(MAX_IMPORT_ROWS)));
});

test("a batch exactly at the cap is accepted", () => {
  const raw = JSON.stringify(
    Array.from({ length: MAX_IMPORT_ROWS }, () => validRow()),
  );
  const result = parseImportPayload(raw);
  assert.equal(result.ok, true);
});

test("every row failing still returns ok with an empty row set", () => {
  const result = parseImportPayload(JSON.stringify([{ subjectCode: "MTH" }]));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.rows.length, 0);
  assert.equal(result.errors.length > 0, true);
});
