import { test } from "node:test";
import assert from "node:assert/strict";
import { evidenceLabel } from "../src/lib/evidence-display";

const confident = { confidence: 0.8, accObservations: 0, lessonObservations: 0, srsObservations: 0 };
const thin = { confidence: 0.2, accObservations: 0, lessonObservations: 0, srsObservations: 0 };

test("evidenceLabel: above the floor there is no label — show the mastery figure", () => {
  assert.equal(evidenceLabel({ ...confident, accObservations: 20 }), null);
});

test("evidenceLabel: exactly at the floor is confident enough", () => {
  assert.equal(evidenceLabel({ ...thin, confidence: 0.35, accObservations: 4 }), null);
});

test("evidenceLabel: questions are reported by count", () => {
  assert.equal(evidenceLabel({ ...thin, accObservations: 3 }), "3 questions answered");
});

test("evidenceLabel: one question reads in the singular", () => {
  assert.equal(evidenceLabel({ ...thin, accObservations: 1 }), "1 question answered");
});

test("evidenceLabel: practice wins when several channels have evidence", () => {
  assert.equal(
    evidenceLabel({ ...thin, accObservations: 2, lessonObservations: 5, srsObservations: 9 }),
    "2 questions answered",
  );
});

test("evidenceLabel: lesson-only evidence reads as progress, not a count", () => {
  assert.equal(evidenceLabel({ ...thin, lessonObservations: 2 }), "Lesson in progress");
});

test("evidenceLabel: card reviews are reported by count, with plurals", () => {
  assert.equal(evidenceLabel({ ...thin, srsObservations: 1 }), "1 card review");
  assert.equal(evidenceLabel({ ...thin, srsObservations: 4 }), "4 card reviews");
});

test("evidenceLabel: no evidence at all has no label", () => {
  assert.equal(evidenceLabel(thin), null);
});
