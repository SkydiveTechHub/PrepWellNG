import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mapProviderQuestion,
  fingerprintPayload,
  MAPPER_VERSION,
} from "../src/lib/question-provider/mapper";

/** The documented payload, captured live on 2026-09-02. */
function payload(overrides: Record<string, unknown> = {}) {
  return {
    id: 4821,
    question: "Which of the following is the chemical formula for table salt?",
    section: null,
    option: { a: "NaCl", b: "KCl", c: "CaCO3", d: "NaOH" },
    answer: "a",
    solution: "NaCl is sodium chloride...",
    image: null,
    examtype: "UTME",
    examyear: "2022",
    ...overrides,
  };
}

function reasonFields(result: ReturnType<typeof mapProviderQuestion>) {
  return result.ok ? [] : result.reasons.map((r) => r.field);
}

test("the documented payload maps cleanly", () => {
  const result = mapProviderQuestion(payload());
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.providerQuestionId, "4821");
  assert.equal(result.question.examType, "JAMB");
  assert.equal(result.question.examYear, 2022);
  assert.equal(result.question.correctAnswer, "A");
  assert.deepEqual(result.question.options, {
    A: "NaCl", B: "KCl", C: "CaCO3", D: "NaOH",
  });
  assert.equal(result.question.providerImageUrl, null);
});

test("option keys are upper-cased and the answer follows them", () => {
  const result = mapProviderQuestion(payload({ answer: "c" }));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.question.correctAnswer, "C");
});

test("WASSCE and NECO map to our enum", () => {
  for (const [theirs, ours] of [["WASSCE", "WAEC"], ["NECO", "NECO"]]) {
    const result = mapProviderQuestion(payload({ examtype: theirs }));
    assert.equal(result.ok, true, `${theirs} should map`);
    if (!result.ok) return;
    assert.equal(result.question.examType, ours);
  }
});

test("an image URL is carried through unmirrored", () => {
  const url = "https://res.cloudinary.com/aloc-ng/image/upload/v1/x.jpg";
  const result = mapProviderQuestion(payload({ image: url }));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  // The mapper is pure; mirroring happens at promotion time.
  assert.equal(result.question.providerImageUrl, url);
});

test("options given out of order still map by key", () => {
  const result = mapProviderQuestion(
    payload({ option: { d: "NaOH", b: "KCl", a: "NaCl", c: "CaCO3" } }),
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.question.options.A, "NaCl");
  assert.equal(result.question.options.D, "NaOH");
});

test("an answer that is not an option key is rejected", () => {
  // The dangerous case: this marks every student wrong, silently.
  const result = mapProviderQuestion(payload({ answer: "e" }));
  assert.equal(result.ok, false);
  assert.ok(reasonFields(result).includes("correctAnswer"));
});

test("fewer than four usable options is rejected", () => {
  const result = mapProviderQuestion(
    payload({ option: { a: "NaCl", b: "KCl", c: "CaCO3" } }),
  );
  assert.equal(result.ok, false);
  assert.ok(reasonFields(result).includes("options"));
});

test("blank option values do not count toward the four", () => {
  const result = mapProviderQuestion(
    payload({ option: { a: "NaCl", b: "KCl", c: "CaCO3", d: "   " } }),
  );
  assert.equal(result.ok, false);
  assert.ok(reasonFields(result).includes("options"));
});

test("empty question text is rejected", () => {
  const result = mapProviderQuestion(payload({ question: "   " }));
  assert.equal(result.ok, false);
  assert.ok(reasonFields(result).includes("questionText"));
});

test("a missing solution is rejected — explanation is required", () => {
  for (const solution of [null, undefined, "", "   "]) {
    const result = mapProviderQuestion(payload({ solution }));
    assert.equal(result.ok, false, `solution=${String(solution)}`);
    assert.ok(reasonFields(result).includes("explanation"));
  }
});

test("an unparseable year is rejected", () => {
  const result = mapProviderQuestion(payload({ examyear: "n/a" }));
  assert.equal(result.ok, false);
  assert.ok(reasonFields(result).includes("examYear"));
});

test("an unrequestable exam type is rejected", () => {
  const result = mapProviderQuestion(payload({ examtype: "POST-UTME" }));
  assert.equal(result.ok, false);
  assert.ok(reasonFields(result).includes("examType"));
});

test("a rejected payload still carries its dedupe keys", () => {
  // Staging needs them even when promotion fails, or the row cannot be
  // written and we would re-fetch it forever.
  const result = mapProviderQuestion(payload({ answer: "e" }));
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.providerQuestionId, "4821");
  assert.equal(typeof result.fingerprint, "string");
  assert.equal(result.fingerprint.length, 64);
});

test("garbage input is rejected rather than thrown", () => {
  for (const junk of [null, undefined, 42, "text", []]) {
    const result = mapProviderQuestion(junk);
    assert.equal(result.ok, false, `${JSON.stringify(junk)} should reject`);
  }
});

test("the fingerprint is stable across key order and whitespace", () => {
  const a = fingerprintPayload(payload());
  const b = fingerprintPayload(
    payload({ option: { d: "NaOH", c: "CaCO3", b: "KCl", a: "NaCl" } }),
  );
  assert.equal(a, b);
});

test("the fingerprint differs for different questions", () => {
  assert.notEqual(
    fingerprintPayload(payload()),
    fingerprintPayload(payload({ question: "Something else entirely?" })),
  );
});

test("the fingerprint ignores fields that are not identity", () => {
  // Re-issued under a new id with a rewritten solution: still the same question.
  assert.equal(
    fingerprintPayload(payload()),
    fingerprintPayload(payload({ id: 99999, solution: "Rewritten." })),
  );
});

test("MAPPER_VERSION is exported for the re-promotion sweep", () => {
  assert.equal(typeof MAPPER_VERSION, "number");
  assert.ok(MAPPER_VERSION >= 1);
});
