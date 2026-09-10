import { test } from "node:test";
import assert from "node:assert/strict";
import { parseExamSegment, parseYearSegment } from "../src/lib/seo/exam-segment";

test("the three public exams parse to their enum values", () => {
  assert.deepEqual(parseExamSegment("waec"), { segment: "waec", examType: "WAEC", label: "WAEC" });
  assert.deepEqual(parseExamSegment("jamb"), { segment: "jamb", examType: "JAMB", label: "JAMB" });
  assert.deepEqual(parseExamSegment("neco"), { segment: "neco", examType: "NECO", label: "NECO" });
});

test("uppercase is rejected rather than accepted", () => {
  // Accepting both cases would serve the same content at two URLs and split
  // its ranking. One canonical spelling, everything else 404s.
  assert.equal(parseExamSegment("WAEC"), null);
  assert.equal(parseExamSegment("Waec"), null);
});

test("CUSTOM is internal and has no public route", () => {
  assert.equal(parseExamSegment("custom"), null);
});

test("unknown and malformed segments are rejected", () => {
  for (const segment of ["", " ", "gce", "waec/", "../waec", "waec2019"]) {
    assert.equal(parseExamSegment(segment), null, `${segment} should be rejected`);
  }
});

test("a four-digit year parses", () => {
  assert.equal(parseYearSegment("2019"), 2019);
});

test("non-years are rejected instead of coerced", () => {
  // Number("2019abc") is NaN but parseInt would happily return 2019, which
  // would make /2019abc a duplicate of /2019.
  for (const segment of ["19", "20190", "2019abc", "abc", "", "-2019", "20.19"]) {
    assert.equal(parseYearSegment(segment), null, `${segment} should be rejected`);
  }
});
