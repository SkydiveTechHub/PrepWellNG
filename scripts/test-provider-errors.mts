import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyStatus } from "../src/lib/question-provider/errors";

test("200 is a successful draw", () => {
  assert.equal(classifyStatus(200), "ok");
});

test("404 means the filter is empty, NOT that the call failed", () => {
  // Measured: {"status":404,"message":"No questions found for those filters."}
  // Treating this as a failure would retry empty combinations forever.
  assert.equal(classifyStatus(404), "empty");
});

test("403 is terminal — our token is not entitled to that exam", () => {
  assert.equal(classifyStatus(403), "terminal");
});

test("401 is terminal — the token is bad and retrying cannot help", () => {
  assert.equal(classifyStatus(401), "terminal");
});

test("429 is retryable, not terminal", () => {
  assert.equal(classifyStatus(429), "retryable");
});

test("server errors are retryable", () => {
  assert.equal(classifyStatus(500), "retryable");
  assert.equal(classifyStatus(503), "retryable");
});

test("unexpected 4xx codes are retryable rather than silently empty", () => {
  // Being wrong toward "retryable" costs a call; being wrong toward "empty"
  // permanently marks a real paper as having nothing in it.
  assert.equal(classifyStatus(418), "retryable");
});
