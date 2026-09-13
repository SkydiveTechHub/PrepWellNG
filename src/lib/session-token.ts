import { getToken } from "next-auth/jwt";

/**
 * Whether Auth.js named the student session cookie with the `__Secure-`
 * prefix. It does that whenever the site URL is https — taken from AUTH_URL
 * when set, otherwise from the request — and this mirrors that rule.
 */
export function usesSecureCookie(requestUrl: string): boolean {
  return (
    process.env.AUTH_URL ??
    process.env.NEXTAUTH_URL ??
    requestUrl
  ).startsWith("https:");
}

/**
 * The student JWT, decoded straight off the request without the `auth()`
 * session round-trip.
 *
 * Always go through this rather than calling getToken directly. getToken
 * defaults secureCookie to false and so reads `authjs.session-token`, while
 * Auth.js writes `__Secure-authjs.session-token` on https. The names agree on
 * http localhost and nowhere else: in production every direct caller saw no
 * session, which sent /login and /dashboard redirecting into each other.
 *
 * Kept free of database imports — the proxy calls it on every request.
 */
export function getSessionToken(req: Request) {
  return getToken({
    req,
    secret: process.env.AUTH_SECRET,
    secureCookie: usesSecureCookie(req.url),
  });
}
