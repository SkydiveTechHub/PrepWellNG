import { test } from "node:test";
import assert from "node:assert/strict";
import {
  distinctTopicRefs,
  reapOneAttempt,
  type ReapTx,
} from "../src/lib/attempt-lifecycle";

/**
 * A fake transaction client that behaves like the real one for the one
 * property this suite cares about: `updateMany` only ever flips a row from
 * IN_PROGRESS once. A second call against an already-`TIMED_OUT` row reports
 * `count: 0`, exactly like Postgres would for `WHERE status = 'IN_PROGRESS'`
 * matching nothing.
 */
function fakeReapTx(initialStatus: "IN_PROGRESS" | "TIMED_OUT" = "IN_PROGRESS") {
  let status = initialStatus;
  const createManyCalls: Array<{ data: unknown[] }> = [];
  const tx: ReapTx = {
    assessmentAttempt: {
      updateMany: async ({ where }) => {
        if (status !== "IN_PROGRESS" || where.status !== "IN_PROGRESS") {
          return { count: 0 };
        }
        status = "TIMED_OUT";
        return { count: 1 };
      },
    },
    learningEvent: {
      createMany: async (args) => {
        createManyCalls.push(args);
        return { count: args.data.length };
      },
    },
  };
  return { tx, createManyCalls, getStatus: () => status };
}

test("distinctTopicRefs: one entry per topic, however many questions", () => {
  const refs = distinctTopicRefs([
    { topicId: "a", subjectId: "s1" },
    { topicId: "a", subjectId: "s1" },
    { topicId: "b", subjectId: "s1" },
    { topicId: "a", subjectId: "s1" },
  ]);
  assert.equal(refs.length, 2);
  assert.deepEqual(refs.map((r) => r.topicId).sort(), ["a", "b"]);
});

test("distinctTopicRefs: a 40-question paper over 12 topics yields 12", () => {
  const questions = Array.from({ length: 40 }, (_, i) => ({
    topicId: `t${i % 12}`,
    subjectId: "s1",
  }));
  assert.equal(distinctTopicRefs(questions).length, 12);
});

test("distinctTopicRefs: questions with no topic are dropped", () => {
  const refs = distinctTopicRefs([
    { topicId: null, subjectId: "s1" },
    { topicId: "a", subjectId: "s1" },
    { topicId: null, subjectId: "s2" },
  ]);
  assert.deepEqual(refs, [{ topicId: "a", subjectId: "s1" }]);
});

test("distinctTopicRefs: an empty paper yields nothing", () => {
  assert.deepEqual(distinctTopicRefs([]), []);
});

test("distinctTopicRefs: the first subject seen for a topic wins", () => {
  const refs = distinctTopicRefs([
    { topicId: "a", subjectId: "s1" },
    { topicId: "a", subjectId: "s2" },
  ]);
  assert.deepEqual(refs, [{ topicId: "a", subjectId: "s1" }]);
});

test("reapOneAttempt: transitions the attempt and emits one event per topic", async () => {
  const { tx, createManyCalls, getStatus } = fakeReapTx();
  const startedAt = new Date("2026-08-10T00:00:00Z");

  const count = await reapOneAttempt(tx, "student-1", {
    id: "attempt-1",
    startedAt,
    topicRefs: [
      { topicId: "t1", subjectId: "s1" },
      { topicId: "t2", subjectId: "s1" },
    ],
  });

  assert.equal(count, 1);
  assert.equal(getStatus(), "TIMED_OUT");
  assert.equal(createManyCalls.length, 1);
  assert.equal(createManyCalls[0].data.length, 2);
  assert.deepEqual(
    createManyCalls[0].data.map((e) => (e as { topicId: string }).topicId).sort(),
    ["t1", "t2"],
  );
  for (const event of createManyCalls[0].data as Array<{
    kind: string;
    sourceId: string;
    occurredAt: Date;
  }>) {
    assert.equal(event.kind, "QUIZ_ABANDONED");
    assert.equal(event.sourceId, "attempt-1");
    assert.equal(event.occurredAt, startedAt);
  }
});

test("reapOneAttempt: an attempt with no topics transitions but emits nothing", async () => {
  const { tx, createManyCalls } = fakeReapTx();

  const count = await reapOneAttempt(tx, "student-1", {
    id: "attempt-1",
    startedAt: new Date(),
    topicRefs: [],
  });

  assert.equal(count, 1);
  assert.equal(createManyCalls.length, 0);
});

test("reapOneAttempt: a second reap of the same attempt emits nothing", async () => {
  // Simulates the double-count bug: two overlapping generate requests both
  // see the attempt as stale and both call reapOneAttempt against the same
  // underlying row. The first call's updateMany flips IN_PROGRESS ->
  // TIMED_OUT and emits events; the second call's updateMany matches nothing
  // (the row is no longer IN_PROGRESS) and must not emit a second event set.
  const { tx, createManyCalls } = fakeReapTx();
  const attempt = {
    id: "attempt-1",
    startedAt: new Date("2026-08-10T00:00:00Z"),
    topicRefs: [{ topicId: "t1", subjectId: "s1" }],
  };

  const first = await reapOneAttempt(tx, "student-1", attempt);
  const second = await reapOneAttempt(tx, "student-1", attempt);

  assert.equal(first, 1);
  assert.equal(second, 0);
  assert.equal(createManyCalls.length, 1, "events emitted only once across both reaps");
});

test("reapOneAttempt: an already-TIMED_OUT attempt is a no-op", async () => {
  const { tx, createManyCalls } = fakeReapTx("TIMED_OUT");

  const count = await reapOneAttempt(tx, "student-1", {
    id: "attempt-1",
    startedAt: new Date(),
    topicRefs: [{ topicId: "t1", subjectId: "s1" }],
  });

  assert.equal(count, 0);
  assert.equal(createManyCalls.length, 0);
});
