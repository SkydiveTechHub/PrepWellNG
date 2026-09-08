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

test("403 with an insufficient-credit body is exhausted, not terminal", () => {
  // Measured 2026-09-07 against sdashapi:
  // {"status":403,"message":"Insufficient credit. Please top up your wallet."}
  // Terminal here is what permanently retires a paper over a billing lapse.
  assert.equal(
    classifyStatus(403, { message: "Insufficient credit. Please top up your wallet." }),
    "exhausted",
  );
});

test("403 with an entitlement body stays terminal", () => {
  assert.equal(
    classifyStatus(403, { message: 'You have no permission to query the "post-utme" exam.' }),
    "terminal",
  );
});

test("403 with no body stays terminal", () => {
  // Unreadable body: assume the permanent cause. An exhausted misread would
  // retry a revoked key every 15 minutes forever.
  assert.equal(classifyStatus(403, null), "terminal");
  assert.equal(classifyStatus(403), "terminal");
});

test("402 Payment Required is exhausted without needing a body", () => {
  assert.equal(classifyStatus(402), "exhausted");
});

test("401 stays terminal even if the body mentions credit", () => {
  // A bad token is a bad token; the wording must not override the status.
  assert.equal(classifyStatus(401, { message: "Insufficient credit." }), "terminal");
});
