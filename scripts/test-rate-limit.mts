import { test } from "node:test";
import assert from "node:assert/strict";
import { rateLimit, resetRateLimits } from "../src/lib/rate-limit";

const T0 = 1_770_000_000_000;

test("allows requests up to the limit", () => {
  resetRateLimits();
  for (let i = 0; i < 3; i++) {
    const result = rateLimit({ key: "k", limit: 3, windowSeconds: 60, now: T0 });
    assert.equal(result.ok, true, `request ${i + 1} should pass`);
  }
});

test("blocks the request after the limit", () => {
  resetRateLimits();
  for (let i = 0; i < 3; i++) {
    rateLimit({ key: "k", limit: 3, windowSeconds: 60, now: T0 });
  }
  const blocked = rateLimit({ key: "k", limit: 3, windowSeconds: 60, now: T0 });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.remaining, 0);
  assert.ok(blocked.retryAfterSeconds > 0);
});

test("reports remaining allowance", () => {
  resetRateLimits();
  assert.equal(
    rateLimit({ key: "k", limit: 3, windowSeconds: 60, now: T0 }).remaining,
    2,
  );
  assert.equal(
    rateLimit({ key: "k", limit: 3, windowSeconds: 60, now: T0 }).remaining,
    1,
  );
});

test("the window resets once it elapses", () => {
  resetRateLimits();
  for (let i = 0; i < 3; i++) {
    rateLimit({ key: "k", limit: 3, windowSeconds: 60, now: T0 });
  }
  assert.equal(
    rateLimit({ key: "k", limit: 3, windowSeconds: 60, now: T0 }).ok,
    false,
  );
  const after = rateLimit({
    key: "k",
    limit: 3,
    windowSeconds: 60,
    now: T0 + 60_001,
  });
  assert.equal(after.ok, true);
  assert.equal(after.remaining, 2);
});

test("keys are tracked independently", () => {
  resetRateLimits();
  for (let i = 0; i < 3; i++) {
    rateLimit({ key: "a", limit: 3, windowSeconds: 60, now: T0 });
  }
  assert.equal(
    rateLimit({ key: "a", limit: 3, windowSeconds: 60, now: T0 }).ok,
    false,
  );
  // A different student must not be blocked by someone else's burst.
  assert.equal(
    rateLimit({ key: "b", limit: 3, windowSeconds: 60, now: T0 }).ok,
    true,
  );
});

test("retryAfter shrinks as the window drains", () => {
  resetRateLimits();
  rateLimit({ key: "k", limit: 1, windowSeconds: 60, now: T0 });
  const early = rateLimit({ key: "k", limit: 1, windowSeconds: 60, now: T0 });
  const late = rateLimit({
    key: "k",
    limit: 1,
    windowSeconds: 60,
    now: T0 + 50_000,
  });
  assert.equal(early.ok, false);
  assert.equal(late.ok, false);
  assert.ok(late.retryAfterSeconds < early.retryAfterSeconds);
  assert.ok(late.retryAfterSeconds >= 1);
});

test("a limit of zero blocks the first request", () => {
  resetRateLimits();
  // First call opens the window and is allowed by construction; the second is
  // the one that must be rejected.
  rateLimit({ key: "k", limit: 0, windowSeconds: 60, now: T0 });
  assert.equal(
    rateLimit({ key: "k", limit: 0, windowSeconds: 60, now: T0 }).ok,
    false,
  );
});
