import { test } from "node:test";
import assert from "node:assert/strict";
import { CRON_BUDGET_MS, checkCronRequest, deadlineFrom } from "../src/lib/cron-auth";

const secret = "a-very-long-cron-secret";

test("POST with the right bearer secret is allowed", () => {
  assert.equal(checkCronRequest({ method: "POST", authorization: `Bearer ${secret}`, secret }), "ok");
});

test("wrong, missing or malformed credentials are unauthorized", () => {
  for (const authorization of [null, "", secret, `Bearer ${secret}x`, `Bearer ${secret.slice(1)}`, `Basic ${secret}`, "Bearer "]) {
    assert.equal(checkCronRequest({ method: "POST", authorization, secret }), "unauthorized", String(authorization));
  }
});

test("only POST is accepted", () => {
  assert.equal(checkCronRequest({ method: "GET", authorization: `Bearer ${secret}`, secret }), "method-not-allowed");
});

test("no configured secret means the feature is off, whatever is sent", () => {
  assert.equal(checkCronRequest({ method: "POST", authorization: "Bearer anything", secret: null }), "not-configured");
});

test("the budget is 40 seconds from the start of the request", () => {
  assert.equal(CRON_BUDGET_MS, 40_000);
  assert.equal(deadlineFrom(1_000), 41_000);
});
