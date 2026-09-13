import { clientKey, rateLimit, type RateLimitResult, type RedisConfig } from "./rate-limit";

// Password sign-in limits. Checked before the user lookup and bcrypt, so a
// blocked attempt costs neither a database round trip nor hashing CPU.
//
// There is deliberately no IP-only limit: a school lab or a mobile carrier's
// NAT puts hundreds of students behind one address, and an exam-morning rush
// would lock them all out. The two limits instead are:
//   - email + IP: the ordinary guesser, retrying one account from one place.
//   - email alone, looser: the same account guessed from many addresses. Kept
//     well above normal use because hitting it also locks the real owner out.

export const LOGIN_LIMITS = {
  perEmailAndIp: { limit: 5, windowSeconds: 15 * 60 },
  perEmail: { limit: 20, windowSeconds: 60 * 60 },
} as const;

export async function checkLoginRateLimit(
  email: string,
  request: Request,
  config?: RedisConfig | null,
): Promise<RateLimitResult> {
  const normalized = email.trim().toLowerCase();
  // Sequential, not parallel: the per-email budget should only be spent by
  // attempts that got past the tighter per-IP one.
  const perIp = await rateLimit(
    { key: clientKey(request, `login:${normalized}`), ...LOGIN_LIMITS.perEmailAndIp },
    config,
  );
  if (!perIp.ok) return perIp;
  return rateLimit(
    { key: `login-email:${normalized}`, ...LOGIN_LIMITS.perEmail },
    config,
  );
}
