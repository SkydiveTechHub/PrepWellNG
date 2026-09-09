import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PAPER_MIN_QUESTIONS,
  TOPIC_MIN_QUESTIONS,
  isPaperPageEligible,
  isTopicPageEligible,
} from "../src/lib/seo/eligibility";
import { publicQuestionWhere } from "../src/lib/seo/question-scope";

const topic = (over: Partial<Parameters<typeof isTopicPageEligible>[0]> = {}) => ({
  description: "Cells are the basic unit of life.",
  subtopicCount: 3,
  publicQuestionCount: 5,
  ...over,
});

test("a topic with prose and enough questions is eligible", () => {
  assert.equal(isTopicPageEligible(topic()), true);
});

test("subtopics substitute for a missing description", () => {
  assert.equal(isTopicPageEligible(topic({ description: null, subtopicCount: 2 })), true);
  assert.equal(isTopicPageEligible(topic({ description: "   ", subtopicCount: 2 })), true);
});

test("no prose and too few subtopics is not eligible", () => {
  assert.equal(isTopicPageEligible(topic({ description: null, subtopicCount: 1 })), false);
});

test("questions are required even when the prose is good", () => {
  // A topic page with nothing to practise is a brochure, and a few hundred
  // brochures is what a doorway-page classification looks like.
  assert.equal(
    isTopicPageEligible(topic({ publicQuestionCount: TOPIC_MIN_QUESTIONS - 1 })),
    false,
  );
  assert.equal(isTopicPageEligible(topic({ publicQuestionCount: 0 })), false);
});

test("the topic threshold is inclusive at the boundary", () => {
  assert.equal(isTopicPageEligible(topic({ publicQuestionCount: TOPIC_MIN_QUESTIONS })), true);
});

test("a paper needs a real number of questions", () => {
  assert.equal(isPaperPageEligible({ publicQuestionCount: PAPER_MIN_QUESTIONS }), true);
  assert.equal(isPaperPageEligible({ publicQuestionCount: PAPER_MIN_QUESTIONS - 1 }), false);
});

test("the public scope excludes provider-sourced questions", () => {
  // Provider content is licensed for use inside the product, not for
  // republication on indexable pages.
  assert.deepEqual(publicQuestionWhere().providerQuestion, { is: null });
});

test("the public scope is objective questions only", () => {
  // Theory questions have no options, and the sample renderer needs them.
  assert.equal(publicQuestionWhere().questionType, "OBJECTIVE");
});

test("extra filters merge without dropping the public constraints", () => {
  const where = publicQuestionWhere({ subjectId: "s1", examYear: 2019 });
  assert.equal(where.subjectId, "s1");
  assert.equal(where.examYear, 2019);
  assert.deepEqual(where.providerQuestion, { is: null });
  assert.equal(where.questionType, "OBJECTIVE");
});

test("a caller cannot accidentally override the public constraints", () => {
  const where = publicQuestionWhere({
    providerQuestion: undefined,
    questionType: "THEORY",
  });
  assert.deepEqual(where.providerQuestion, { is: null });
  assert.equal(where.questionType, "OBJECTIVE");
});
