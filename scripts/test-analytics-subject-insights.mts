import { test } from "node:test";
import assert from "node:assert/strict";
import { subjectInsights } from "../src/engines/analytics/subject-insights";
import type { TopicGroups, TopicRow } from "../src/engines/analytics/topic-groups";
import type { Profile } from "../src/engines/analytics/profile";

function row(topicId: string, overrides: Partial<TopicRow> = {}): TopicRow {
  return {
    topicId,
    subjectId: "subj-1",
    title: `Topic ${topicId}`,
    slug: `topic-${topicId}`,
    group: "NEEDS_WORK",
    category: "WEAK",
    mastery: 30,
    retention: 0.9,
    confidence: 0.8,
    observations: 20,
    accObservations: 20,
    lessonObservations: 0,
    srsObservations: 0,
    bottleneckScore: 0,
    lastStudy: null,
    stale: false,
    ...overrides,
  };
}

function groups(overrides: Partial<TopicGroups> = {}): TopicGroups {
  return {
    NEEDS_WORK: [],
    NEEDS_REVISION: [],
    UNPROVEN: [],
    COMING_ALONG: [],
    SOLID: [],
    ...overrides,
  };
}

const okProfile: Profile = {
  status: "ok",
  answered: 50,
  bands: [{ difficulty: "INTERMEDIATE", answered: 50, accuracy: 70 }],
  rapidGuessRate: 0,
  pacing: { meanSeconds: 60, expectedSeconds: 60, ratio: 1, verdict: "ON_PACE" },
};

const input = (over: Partial<Parameters<typeof subjectInsights>[0]> = {}) => ({
  subjectId: "subj-1",
  subjectSlug: "physics",
  groups: groups(),
  profile: okProfile,
  ...over,
});

test("names the weak topics", () => {
  const out = subjectInsights(
    input({ groups: groups({ NEEDS_WORK: [row("t1"), row("t2"), row("t3")] }) }),
  );
  const weak = out.filter((i) => i.kind === "WEAK_TOPIC");
  assert.equal(weak.length, 2, "at most the top two weak topics are named");
  assert.ok(weak[0].headline.includes("Topic t1"));
  assert.equal(weak[0].topicId, "t1");
});

test("a bottleneck outranks a plain weakness", () => {
  const out = subjectInsights(
    input({
      groups: groups({
        NEEDS_WORK: [row("t1", { category: "BOTTLENECK", bottleneckScore: 9 })],
      }),
    }),
  );
  const bottleneck = out.find((i) => i.kind === "BOTTLENECK_TOPIC");
  assert.ok(bottleneck);
  assert.equal(bottleneck.severity, "CRITICAL");
});

test("rapid guessing is critical", () => {
  const out = subjectInsights(
    input({ profile: { ...okProfile, rapidGuessRate: 40 } }),
  );
  const guessing = out.find((i) => i.kind === "RAPID_GUESSING");
  assert.ok(guessing);
  assert.equal(guessing.severity, "CRITICAL");
});

test("pacing verdicts produce their own insights", () => {
  const slow = subjectInsights(
    input({
      profile: {
        ...okProfile,
        pacing: { meanSeconds: 120, expectedSeconds: 60, ratio: 2, verdict: "SLOW" },
      },
    }),
  );
  assert.ok(slow.some((i) => i.kind === "PACING_SLOW"));

  const rushed = subjectInsights(
    input({
      profile: {
        ...okProfile,
        pacing: { meanSeconds: 20, expectedSeconds: 60, ratio: 0.33, verdict: "RUSHED" },
      },
    }),
  );
  assert.ok(rushed.some((i) => i.kind === "PACING_RUSHED"));
});

test("untouched topics are reported as unknowns, not weaknesses", () => {
  const out = subjectInsights(
    input({
      groups: groups({
        UNPROVEN: [row("t1", { group: "UNPROVEN", category: "UNTOUCHED" })],
      }),
    }),
  );
  const unknown = out.find((i) => i.kind === "INSUFFICIENT_EVIDENCE");
  assert.ok(unknown);
  assert.equal(unknown.severity, "INFO");
  assert.ok(!out.some((i) => i.kind === "WEAK_TOPIC"));
});

test("a stale solid topic is flagged", () => {
  const out = subjectInsights(
    input({
      groups: groups({
        SOLID: [row("t1", { group: "SOLID", category: null, mastery: 85, stale: true })],
      }),
    }),
  );
  assert.ok(out.some((i) => i.kind === "STALE_TOPIC"));
});

test("a subject with no gaps earns a win", () => {
  const out = subjectInsights(
    input({
      groups: groups({
        SOLID: [row("t1", { group: "SOLID", category: null, mastery: 90 })],
      }),
    }),
  );
  const win = out.find((i) => i.kind === "SUBJECT_STRENGTH");
  assert.ok(win);
  assert.equal(win.severity, "WIN");
});

test("an insufficient profile produces no pacing or guessing claims", () => {
  const out = subjectInsights(
    input({ profile: { status: "insufficient", answered: 4, needed: 20 } }),
  );
  assert.ok(!out.some((i) => i.kind === "PACING_SLOW" || i.kind === "RAPID_GUESSING"));
});

test("every insight carries a non-empty headline", () => {
  const out = subjectInsights(
    input({
      groups: groups({
        NEEDS_WORK: [row("t1")],
        NEEDS_REVISION: [row("t2", { group: "NEEDS_REVISION", category: "DECAYED" })],
        UNPROVEN: [row("t3", { group: "UNPROVEN", category: "UNTOUCHED" })],
      }),
      profile: { ...okProfile, rapidGuessRate: 40 },
    }),
  );
  assert.ok(out.length > 0);
  assert.ok(out.every((i) => i.headline.trim().length > 0));
});
