// Fixed-window rate limiting, in process memory.
//
// Deliberately not distributed: this app runs on a single Node server per
// region, and an in-memory counter costs nothing and needs no extra service. On
// a multi-instance deployment each instance enforces its own window, so the
// effective limit is `limit x instances` — still a hard ceiling on abuse, just a
// looser one. Move the store to Redis if that stops being good enough.

type Window = { count: number; resetAt: number };

const windows = new Map<string, Window>();

/** Stops the map growing without bound on a long-lived server. */
const MAX_TRACKED_KEYS = 10_000;

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

export function rateLimit({
  key,
  limit,
  windowSeconds,
  now = Date.now(),
}: {
  key: string;
  limit: number;
  windowSeconds: number;
  now?: number;
}): RateLimitResult {
  const existing = windows.get(key);

  if (!existing || existing.resetAt <= now) {
    if (windows.size >= MAX_TRACKED_KEYS) sweep(now);
    windows.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return { ok: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }

  existing.count += 1;
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((existing.resetAt - now) / 1000),
  );

  if (existing.count > limit) {
    return { ok: false, remaining: 0, retryAfterSeconds };
  }

  return {
    ok: true,
    remaining: Math.max(0, limit - existing.count),
    retryAfterSeconds,
  };
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
