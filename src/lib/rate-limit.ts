// Fixed-window rate limiting.
//
// Production runs on Vercel: many short-lived serverless instances, each with
// its own memory. A counter kept in process memory there is per-instance and
// evaporates on every cold start, so a login or registration brute force just
// spreads across instances. The shared store is Upstash Redis, spoken over its
// REST API with plain `fetch` (no client dependency, works in any runtime).
//
// Redis is used when UPSTASH_REDIS_REST_URL/TOKEN (or the KV_REST_API_* names
// the Vercel marketplace integration sets, optionally SC_-prefixed) are present. Without them — local
// development, tests — and whenever Redis errors or is slow, the limiter falls
// back to the in-memory store. Failing over to a per-instance limit, rather
// than failing closed, keeps a Redis outage from locking every student out of
// quizzes and sign-up.

type Window = { count: number; resetAt: number };

const windows = new Map<string, Window>();

/** Stops the map growing without bound on a long-lived server. */
const MAX_TRACKED_KEYS = 10_000;

/** A limiter that waits longer than this on Redis is worse than a looser limit. */
const REDIS_TIMEOUT_MS = 800;

const KEY_PREFIX = "rl:";

function sweep(now: number) {
  for (const [key, window] of windows) {
    if (window.resetAt <= now) windows.delete(key);
  }
}

export type RateLimitResult = {
  ok: boolean;
  /** Requests still allowed in the current window. */
  remaining: number;
  /** Seconds until the window resets — surfaced as `Retry-After`. */
  retryAfterSeconds: number;
};

type RateLimitArgs = {
  key: string;
  limit: number;
  windowSeconds: number;
  now?: number;
};

/** Turns a window's count and time-to-reset into a result. Shared by both stores. */
function toResult(
  count: number,
  limit: number,
  msUntilReset: number,
): RateLimitResult {
  // The request that opens a window is always allowed, matching the original
  // in-memory behaviour (a limit of zero blocks from the second request).
  if (count <= 1) {
    return { ok: true, remaining: Math.max(0, limit - 1), retryAfterSeconds: 0 };
  }
  const retryAfterSeconds = Math.max(1, Math.ceil(msUntilReset / 1000));
  if (count > limit) return { ok: false, remaining: 0, retryAfterSeconds };
  return { ok: true, remaining: Math.max(0, limit - count), retryAfterSeconds };
}

export function rateLimitInMemory({
  key,
  limit,
  windowSeconds,
  now = Date.now(),
}: RateLimitArgs): RateLimitResult {
  const existing = windows.get(key);

  if (!existing || existing.resetAt <= now) {
    if (windows.size >= MAX_TRACKED_KEYS) sweep(now);
    windows.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return toResult(1, limit, windowSeconds * 1000);
  }

  existing.count += 1;
  return toResult(existing.count, limit, existing.resetAt - now);
}

export type RedisConfig = {
  url: string;
  token: string;
  fetch?: typeof fetch;
};

function redisConfigFromEnv(): RedisConfig | null {
  // SC_ is the custom prefix this project's Vercel Upstash integration was
  // connected with. Never use the read-only token: INCR would be refused and
  // every check would silently fall back to the in-memory store.
  const url =
    process.env.UPSTASH_REDIS_REST_URL ??
    process.env.KV_REST_API_URL ??
    process.env.SC_KV_REST_API_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ??
    process.env.KV_REST_API_TOKEN ??
    process.env.SC_KV_REST_API_TOKEN;
  return url && token ? { url: url.replace(/\/+$/, ""), token } : null;
}

/**
 * One atomic round trip: open the window if it isn't open, count this request,
 * read how long the window has left. MULTI/EXEC matters — as three separate
 * commands, a window expiring between SET and INCR would leave INCR creating a
 * key with no TTL, and that key would block its owner forever.
 */
export async function rateLimitInRedis(
  { key, limit, windowSeconds }: RateLimitArgs,
  config: RedisConfig,
): Promise<RateLimitResult> {
  const redisKey = `${KEY_PREFIX}${key}`;
  const windowMs = windowSeconds * 1000;
  const doFetch = config.fetch ?? fetch;

  const response = await doFetch(`${config.url}/multi-exec`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([
      ["SET", redisKey, "0", "PX", String(windowMs), "NX"],
      ["INCR", redisKey],
      ["PTTL", redisKey],
    ]),
    signal: AbortSignal.timeout(REDIS_TIMEOUT_MS),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Upstash responded ${response.status}`);
  }

  const replies = (await response.json()) as { result?: unknown; error?: string }[];
  const failed = Array.isArray(replies) ? replies.find((r) => r.error) : null;
  if (!Array.isArray(replies) || replies.length !== 3 || failed) {
    throw new Error(`Upstash transaction failed: ${failed?.error ?? "bad reply"}`);
  }

  const count = Number(replies[1].result);
  const pttl = Number(replies[2].result);
  if (!Number.isFinite(count) || !Number.isFinite(pttl)) {
    throw new Error("Upstash returned a non-numeric reply");
  }
  // PTTL is -1/-2 only if the key lost its expiry, which the transaction
  // rules out; treat it as a fresh full window rather than a zero wait.
  return toResult(count, limit, pttl >= 0 ? pttl : windowMs);
}

let lastRedisErrorLoggedAt = 0;

export async function rateLimit(
  args: RateLimitArgs,
  config: RedisConfig | null = redisConfigFromEnv(),
): Promise<RateLimitResult> {
  if (!config) return rateLimitInMemory(args);
  try {
    return await rateLimitInRedis(args, config);
  } catch (error) {
    // Once a minute at most: during an outage every request lands here.
    const now = Date.now();
    if (now - lastRedisErrorLoggedAt > 60_000) {
      lastRedisErrorLoggedAt = now;
      console.error("rate-limit: Redis unavailable, using in-memory limit", error);
    }
    return rateLimitInMemory(args);
  }
}

/** Test seam — the module-level map otherwise leaks between test cases. */
export function resetRateLimits() {
  windows.clear();
}

/**
 * Best-effort client identity for unauthenticated routes. Prefers the
 * proxy-set forwarding headers, since the socket address is the load balancer.
 */
export function clientKey(req: Request, scope: string): string {
  const forwarded = req.headers.get("x-forwarded-for");
  const ip =
    forwarded?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  return `${scope}:${ip}`;
}

export function tooManyRequests(retryAfterSeconds: number) {
  return Response.json(
    { error: "Too many requests. Please slow down and try again shortly." },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
  );
}
