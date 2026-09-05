import { test } from "node:test";
import assert from "node:assert/strict";
import {
  toExamType,
  toProviderExamSlug,
  toProviderSubjectSlug,
  PROVIDER_EXAM_SLUGS,
} from "../src/lib/question-provider/alias";

test("the three supported exam slugs map to our enum", () => {
  assert.equal(toExamType("utme"), "JAMB");
  assert.equal(toExamType("wassce"), "WAEC");
  assert.equal(toExamType("neco"), "NECO");
});

test("exam slugs are matched case- and whitespace-insensitively", () => {
  assert.equal(toExamType(" UTME "), "JAMB");
});

test("unentitled exam types are refused, not folded into CUSTOM", () => {
  // The provider answers these with 403; requesting them is a bug.
  assert.equal(toExamType("post-utme"), null);
  assert.equal(toExamType("university"), null);
  assert.equal(toExamType("waec"), null); // their slug is "wassce"
});

test("our exam enum maps back to their slug", () => {
  assert.equal(toProviderExamSlug("JAMB"), "utme");
  assert.equal(toProviderExamSlug("WAEC"), "wassce");
  assert.equal(toProviderExamSlug("NECO"), "neco");
  assert.equal(toProviderExamSlug("CUSTOM"), null);
});

test("PROVIDER_EXAM_SLUGS holds exactly the three we request", () => {
  assert.deepEqual([...PROVIDER_EXAM_SLUGS], ["utme", "wassce", "neco"]);
});

test("single-word subjects map to themselves", () => {
  assert.equal(toProviderSubjectSlug("chemistry"), "chemistry");
  assert.equal(toProviderSubjectSlug("mathematics"), "mathematics");
  assert.equal(toProviderSubjectSlug("biology"), "biology");
});

test("multi-word subjects map through the alias table", () => {
  assert.equal(toProviderSubjectSlug("english-language"), "english");
  assert.equal(toProviderSubjectSlug("literature-in-english"), "englishlit");
  assert.equal(toProviderSubjectSlug("christian-religious-studies"), "crk");
  assert.equal(toProviderSubjectSlug("islamic-studies"), "irk");
  assert.equal(toProviderSubjectSlug("civic-education"), "civiledu");
  assert.equal(toProviderSubjectSlug("computer-studies"), "computer");
  assert.equal(toProviderSubjectSlug("fine-art"), "fineart");
  assert.equal(toProviderSubjectSlug("agricultural-science"), "agriculture");
  assert.equal(toProviderSubjectSlug("financial-accounting"), "accounting");
});

test("subjects the provider does not carry return null", () => {
  // Measured 2026-09-02: absent from their /v1/subjects response.
  for (const slug of [
    "further-mathematics",
    "technical-drawing",
    "health-education",
    "marketing",
    "office-practice",
    "french",
  ]) {
    assert.equal(toProviderSubjectSlug(slug), null, `${slug} should be unmapped`);
  }
});
