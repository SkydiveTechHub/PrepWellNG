import { test } from "node:test";
import assert from "node:assert/strict";
import { evidenceLabel } from "../src/lib/evidence-display";
import { OBSERVATION_FLOOR } from "../src/engines/learning/evidence";

const now = new Date("2026-08-17T09:00:00Z");

const confident = {
  confidence: 0.8,
  accObservations: 0,
  lessonObservations: 0,
  srsObservations: 0,
  lastStudy: null,
};
const thin = {
  confidence: 0.2,
  accObservations: 0,
  lessonObservations: 0,
  srsObservations: 0,
  lastStudy: null,
};

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

test("evidenceLabel: stale evidence (observations at the floor, old lastStudy) reads as a relative age, not a count", () => {
  const lastStudy = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString();
  const label = evidenceLabel(
    { ...thin, accObservations: OBSERVATION_FLOOR, lastStudy },
    now,
  );
  assert.match(label ?? "", /ago$/);
  assert.doesNotMatch(label ?? "", /answered$/);
});

test("evidenceLabel: one observation below the floor with an old lastStudy still reads as a count, not stale", () => {
  const lastStudy = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString();
  assert.equal(
    evidenceLabel({ ...thin, accObservations: OBSERVATION_FLOOR - 1, lastStudy }, now),
    `${OBSERVATION_FLOOR - 1} questions answered`,
  );
});

test("evidenceLabel: exactly OBSERVATION_FLOOR observations with an old lastStudy crosses into stale", () => {
  const lastStudy = new Date(now.getTime() - 200 * 24 * 60 * 60 * 1000).toISOString();
  const label = evidenceLabel(
    { ...thin, accObservations: OBSERVATION_FLOOR, lastStudy },
    now,
  );
  assert.match(label ?? "", /ago$/);
});

test("evidenceLabel: observations above the floor but no lastStudy falls back to the count copy without crashing", () => {
  assert.equal(
    evidenceLabel({ ...thin, accObservations: OBSERVATION_FLOOR, lastStudy: null }, now),
    `${OBSERVATION_FLOOR} questions answered`,
  );
});
