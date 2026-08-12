import { test } from "node:test";
import assert from "node:assert/strict";
import { distinctTopicRefs } from "../src/lib/attempt-lifecycle";

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
