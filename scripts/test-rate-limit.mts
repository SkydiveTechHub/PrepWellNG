import { test } from "node:test";
import assert from "node:assert/strict";
import {
  rateLimit,
  rateLimitInMemory,
  rateLimitInRedis,
  resetRateLimits,
} from "../src/lib/rate-limit";

const T0 = 1_770_000_000_000;

test("allows requests up to the limit", () => {
  resetRateLimits();
  for (let i = 0; i < 3; i++) {
    const result = rateLimitInMemory({ key: "k", limit: 3, windowSeconds: 60, now: T0 });
    assert.equal(result.ok, true, `request ${i + 1} should pass`);
  }
});

test("blocks the request after the limit", () => {
  resetRateLimits();
  for (let i = 0; i < 3; i++) {
    rateLimitInMemory({ key: "k", limit: 3, windowSeconds: 60, now: T0 });
  }
  const blocked = rateLimitInMemory({ key: "k", limit: 3, windowSeconds: 60, now: T0 });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.remaining, 0);
  assert.ok(blocked.retryAfterSeconds > 0);
});

test("reports remaining allowance", () => {
  resetRateLimits();
  assert.equal(
    rateLimitInMemory({ key: "k", limit: 3, windowSeconds: 60, now: T0 }).remaining,
    2,
  );
  assert.equal(
    rateLimitInMemory({ key: "k", limit: 3, windowSeconds: 60, now: T0 }).remaining,
    1,
  );
});

test("the window resets once it elapses", () => {
  resetRateLimits();
  for (let i = 0; i < 3; i++) {
    rateLimitInMemory({ key: "k", limit: 3, windowSeconds: 60, now: T0 });
  }
  assert.equal(
    rateLimitInMemory({ key: "k", limit: 3, windowSeconds: 60, now: T0 }).ok,
    false,
  );
  const after = rateLimitInMemory({
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
    rateLimitInMemory({ key: "a", limit: 3, windowSeconds: 60, now: T0 });
  }
  assert.equal(
    rateLimitInMemory({ key: "a", limit: 3, windowSeconds: 60, now: T0 }).ok,
    false,
  );
  // A different student must not be blocked by someone else's burst.
  assert.equal(
    rateLimitInMemory({ key: "b", limit: 3, windowSeconds: 60, now: T0 }).ok,
    true,
  );
});

test("retryAfter shrinks as the window drains", () => {
  resetRateLimits();
  rateLimitInMemory({ key: "k", limit: 1, windowSeconds: 60, now: T0 });
  const early = rateLimitInMemory({ key: "k", limit: 1, windowSeconds: 60, now: T0 });
  const late = rateLimitInMemory({
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
  rateLimitInMemory({ key: "k", limit: 0, windowSeconds: 60, now: T0 });
  assert.equal(
    rateLimitInMemory({ key: "k", limit: 0, windowSeconds: 60, now: T0 }).ok,
    false,
  );
});

// ─── Redis store ─────────────────────────────────────────────────────────────
//
// A stand-in for Upstash's /multi-exec endpoint, implementing just the three
// commands the limiter sends, against a clock the test controls.

function fakeUpstash() {
  const store = new Map<string, { value: number; expiresAt: number }>();
  const clock = { now: T0 };
  const calls: unknown[] = [];

  const live = (key: string) => {
    const entry = store.get(key);
    if (entry && entry.expiresAt <= clock.now) store.delete(key);
    return store.get(key);
  };

  const fetchImpl = (async (url: string, init?: RequestInit) => {
    assert.equal(url, "https://redis.test/multi-exec");
    assert.equal(
      (init?.headers as Record<string, string>).Authorization,
      "Bearer secret",
    );
    const commands = JSON.parse(String(init?.body)) as string[][];
    calls.push(commands);
    const results = commands.map(([cmd, key, ...rest]) => {
      if (cmd === "SET") {
        // SET key value PX ms NX
        if (live(key)) return { result: null };
        store.set(key, {
          value: Number(rest[0]),
          expiresAt: clock.now + Number(rest[2]),
        });
        return { result: "OK" };
      }
      if (cmd === "INCR") {
        const entry = live(key);
        if (!entry) {
          store.set(key, { value: 1, expiresAt: Infinity });
          return { result: 1 };
        }
        entry.value += 1;
        return { result: entry.value };
      }
      if (cmd === "PTTL") {
        const entry = live(key);
        if (!entry) return { result: -2 };
        return {
          result: entry.expiresAt === Infinity ? -1 : entry.expiresAt - clock.now,
        };
      }
      return { error: `unsupported ${cmd}` };
    });
    return Response.json(results);
  }) as typeof fetch;

  return {
    clock,
    calls,
    store,
    config: { url: "https://redis.test", token: "secret", fetch: fetchImpl },
  };
}

test("redis: allows up to the limit, then blocks with a Retry-After", async () => {
  const redis = fakeUpstash();
  const args = { key: "login:1.2.3.4", limit: 3, windowSeconds: 60 };
  for (let i = 0; i < 3; i++) {
    const r = await rateLimitInRedis(args, redis.config);
    assert.equal(r.ok, true, `request ${i + 1} should pass`);
    assert.equal(r.remaining, 2 - i);
  }
  redis.clock.now += 20_000;
  const blocked = await rateLimitInRedis(args, redis.config);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.remaining, 0);
  assert.equal(blocked.retryAfterSeconds, 40);
});

test("redis: the window resets once it elapses", async () => {
  const redis = fakeUpstash();
  const args = { key: "k", limit: 1, windowSeconds: 60 };
  await rateLimitInRedis(args, redis.config);
  assert.equal((await rateLimitInRedis(args, redis.config)).ok, false);
  redis.clock.now += 60_001;
  assert.equal((await rateLimitInRedis(args, redis.config)).ok, true);
});

test("redis: keys are namespaced and every key gets an expiry", async () => {
  const redis = fakeUpstash();
  await rateLimitInRedis({ key: "a", limit: 3, windowSeconds: 60 }, redis.config);
  await rateLimitInRedis({ key: "b", limit: 3, windowSeconds: 60 }, redis.config);
  assert.deepEqual([...redis.store.keys()], ["rl:a", "rl:b"]);
  for (const entry of redis.store.values()) {
    assert.notEqual(entry.expiresAt, Infinity, "a key without TTL blocks forever");
  }
  // One atomic transaction per check, not three round trips.
  assert.equal(redis.calls.length, 2);
});

test("redis: an error falls back to the in-memory limit instead of failing", async () => {
  resetRateLimits();
  const originalError = console.error;
  console.error = () => {};
  try {
    const broken = {
      url: "https://redis.test",
      token: "secret",
      fetch: (async () => new Response("down", { status: 503 })) as typeof fetch,
    };
    const args = { key: "fallback", limit: 2, windowSeconds: 60 };
    assert.equal((await rateLimit(args, broken)).ok, true);
    assert.equal((await rateLimit(args, broken)).ok, true);
    // Still limited: the fallback is a real limiter, not a free pass.
    assert.equal((await rateLimit(args, broken)).ok, false);
  } finally {
    console.error = originalError;
  }
});

test("redis: a transaction error is treated as a failure, not a count", async () => {
  const bad = {
    url: "https://redis.test",
    token: "secret",
    fetch: (async () =>
      Response.json([
        { result: "OK" },
        { error: "WRONGTYPE" },
        { result: 1000 },
      ])) as typeof fetch,
  };
  await assert.rejects(
    rateLimitInRedis({ key: "k", limit: 1, windowSeconds: 60 }, bad),
    /WRONGTYPE/,
  );
});

test("without Redis config, rateLimit uses the in-memory store", async () => {
  resetRateLimits();
  const args = { key: "no-redis", limit: 1, windowSeconds: 60 };
  assert.equal((await rateLimit(args, null)).ok, true);
  assert.equal((await rateLimit(args, null)).ok, false);
});
