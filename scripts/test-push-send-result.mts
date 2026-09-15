import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_DELIVERY_ATTEMPTS,
  MAX_SUBSCRIPTION_FAILURES,
  classifySendResult,
  mapWithConcurrency,
  nextDelivery,
  subscriptionEffect,
} from "../src/lib/push-send-result";

test("status codes map to outcomes", () => {
  assert.equal(classifySendResult({ statusCode: 201 }), "sent");
  assert.equal(classifySendResult({ statusCode: 200 }), "sent");
  assert.equal(classifySendResult({ statusCode: 404 }), "gone");
  assert.equal(classifySendResult({ statusCode: 410 }), "gone");
  assert.equal(classifySendResult({ statusCode: 400 }), "invalid");
  assert.equal(classifySendResult({ statusCode: 413 }), "invalid");
  assert.equal(classifySendResult({ statusCode: 429 }), "retry");
  assert.equal(classifySendResult({ statusCode: 500 }), "retry");
  assert.equal(classifySendResult({ statusCode: 503 }), "retry");
  assert.equal(classifySendResult({}), "retry");
  assert.equal(classifySendResult(null), "retry");
});

test("limits", () => {
  assert.equal(MAX_DELIVERY_ATTEMPTS, 3);
  assert.equal(MAX_SUBSCRIPTION_FAILURES, 5);
});

test("delivery transitions", () => {
  assert.deepEqual(nextDelivery("sent", 0), { status: "SENT", attempts: 1 });
  assert.deepEqual(nextDelivery("gone", 0), { status: "GONE", attempts: 1 });
  assert.deepEqual(nextDelivery("invalid", 0), { status: "FAILED", attempts: 1 });
  assert.deepEqual(nextDelivery("retry", 0), { status: "PENDING", attempts: 1 });
  assert.deepEqual(nextDelivery("retry", 1), { status: "PENDING", attempts: 2 });
  assert.deepEqual(nextDelivery("retry", 2), { status: "FAILED", attempts: 3 });
});

test("subscription effects", () => {
  assert.deepEqual(subscriptionEffect("sent", 3, false), { kind: "success" });
  assert.deepEqual(subscriptionEffect("gone", 0, false), { kind: "delete" });
  assert.deepEqual(subscriptionEffect("invalid", 0, true), { kind: "none" });
  assert.deepEqual(subscriptionEffect("retry", 0, false), { kind: "none" });
  assert.deepEqual(subscriptionEffect("retry", 0, true), { kind: "fail", failureCount: 1 });
  assert.deepEqual(subscriptionEffect("retry", 4, true), { kind: "delete" });
});

test("mapWithConcurrency keeps order and never exceeds the limit", async () => {
  let running = 0;
  let peak = 0;
  const out = await mapWithConcurrency([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
    running += 1;
    peak = Math.max(peak, running);
    await new Promise((r) => setTimeout(r, 5 * (8 - n)));
    running -= 1;
    return n * 2;
  });
  assert.deepEqual(out, [2, 4, 6, 8, 10, 12, 14]);
  assert.ok(peak <= 3);
  assert.deepEqual(await mapWithConcurrency([], 3, async (n: number) => n), []);
});
