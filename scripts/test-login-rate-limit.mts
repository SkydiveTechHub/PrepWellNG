import { test } from "node:test";
import assert from "node:assert/strict";
import { checkLoginRateLimit, LOGIN_LIMITS } from "../src/lib/login-rate-limit";

// Each test uses its own email rather than resetting the store: under tsx the
// test file and login-rate-limit.ts can hold separate instances of
// rate-limit.ts, so resetRateLimits() here would not reach the limiter.

function from(ip: string) {
  return new Request("https://example.test/api/auth/callback/credentials", {
    headers: { "x-forwarded-for": ip },
  });
}

async function attempts(email: string, ip: string, n: number) {
  const results = [];
  for (let i = 0; i < n; i++) {
    results.push(await checkLoginRateLimit(email, from(ip), null));
  }
  return results;
}

test("blocks one account being retried from one address", async () => {
  const { limit } = LOGIN_LIMITS.perEmailAndIp;
  const results = await attempts("t1@example.com", "1.1.1.1", limit + 1);
  assert.ok(results.slice(0, limit).every((r) => r.ok));
  assert.equal(results[limit].ok, false);
  assert.ok(results[limit].retryAfterSeconds > 0);
});

test("email casing and whitespace cannot dodge the limit", async () => {
  const { limit } = LOGIN_LIMITS.perEmailAndIp;
  for (let i = 0; i < limit; i++) {
    await checkLoginRateLimit(i % 2 ? "T2@example.com " : "t2@example.com", from("1.1.1.1"), null);
  }
  assert.equal((await checkLoginRateLimit("T2@Example.com", from("1.1.1.1"), null)).ok, false);
});

test("a shared school IP does not lock out other students", async () => {
  await attempts("guesser-target@example.com", "10.0.0.1", 50);
  const classmate = await checkLoginRateLimit("classmate@example.com", from("10.0.0.1"), null);
  assert.equal(classmate.ok, true);
});

test("caps one account being guessed from many addresses", async () => {
  const { limit } = LOGIN_LIMITS.perEmail;
  let ok = 0;
  // A fresh address every attempt, so the per-IP limit never bites.
  for (let i = 0; i < limit * 2; i++) {
    const [result] = await attempts("t4@example.com", `2.2.${i}.1`, 1);
    ok += Number(result.ok);
  }
  assert.equal(ok, limit, "exactly the per-email budget gets through");
});
