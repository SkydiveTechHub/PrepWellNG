import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildProfile,
  PROFILE_MIN_ANSWERS,
  type AnswerSample,
} from "../src/engines/analytics/profile";

function samples(
  count: number,
  overrides: Partial<AnswerSample> = {},
): AnswerSample[] {
  return Array.from({ length: count }, () => ({
    difficulty: "INTERMEDIATE" as const,
    correct: true,
    seconds: 60,
    ...overrides,
  }));
}

test("refuses a profile below the minimum sample", () => {
  const profile = buildProfile(samples(PROFILE_MIN_ANSWERS - 1), 60);
  assert.equal(profile.status, "insufficient");
  if (profile.status !== "insufficient") return;
  assert.equal(profile.answered, PROFILE_MIN_ANSWERS - 1);
  assert.equal(profile.needed, PROFILE_MIN_ANSWERS);
});

test("reports accuracy per difficulty band", () => {
  const profile = buildProfile(
    [
      ...samples(10, { difficulty: "BASIC", correct: true }),
      ...samples(10, { difficulty: "ADVANCED", correct: false }),
    ],
    60,
  );
  assert.equal(profile.status, "ok");
  if (profile.status !== "ok") return;
  const basic = profile.bands.find((b) => b.difficulty === "BASIC");
  const advanced = profile.bands.find((b) => b.difficulty === "ADVANCED");
  assert.equal(basic?.accuracy, 100);
  assert.equal(advanced?.accuracy, 0);
});

test("keeps unlabelled answers as their own band rather than dropping them", () => {
  const profile = buildProfile(
    [
      ...samples(10, { difficulty: null, correct: true }),
      ...samples(10, { difficulty: "BASIC", correct: true }),
    ],
    60,
  );
  assert.equal(profile.status, "ok");
  if (profile.status !== "ok") return;
  const unlabelled = profile.bands.find((b) => b.difficulty === "UNLABELLED");
  assert.equal(unlabelled?.answered, 10);
  assert.equal(profile.answered, 20);
});

test("omits a band with no answers instead of dividing by zero", () => {
  const profile = buildProfile(samples(20, { difficulty: "BASIC" }), 60);
  assert.equal(profile.status, "ok");
  if (profile.status !== "ok") return;
  assert.ok(profile.bands.every((b) => b.answered > 0));
  assert.ok(profile.bands.every((b) => Number.isFinite(b.accuracy)));
});

test("calls a fast student rushed and a slow one slow", () => {
  const rushed = buildProfile(samples(20, { seconds: 20 }), 60);
  const slow = buildProfile(samples(20, { seconds: 120 }), 60);
  const onPace = buildProfile(samples(20, { seconds: 60 }), 60);
  assert.equal(rushed.status === "ok" && rushed.pacing?.verdict, "RUSHED");
  assert.equal(slow.status === "ok" && slow.pacing?.verdict, "SLOW");
  assert.equal(onPace.status === "ok" && onPace.pacing?.verdict, "ON_PACE");
});

test("reports no pacing when there is no authored estimate", () => {
  const profile = buildProfile(samples(20), null);
  assert.equal(profile.status, "ok");
  if (profile.status !== "ok") return;
  assert.equal(profile.pacing, null);
});

test("measures the rapid-guess rate", () => {
  const profile = buildProfile(
    [...samples(5, { seconds: 1 }), ...samples(15, { seconds: 60 })],
    60,
  );
  assert.equal(profile.status, "ok");
  if (profile.status !== "ok") return;
  assert.equal(profile.rapidGuessRate, 25);
});

test("survives answers with no recorded time", () => {
  const profile = buildProfile(samples(20, { seconds: null }), 60);
  assert.equal(profile.status, "ok");
  if (profile.status !== "ok") return;
  assert.equal(profile.pacing, null);
  assert.equal(profile.rapidGuessRate, 0);
});
