import { getToken } from "next-auth/jwt";
import type { NextRequest, NextResponse } from "next/server";

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

/** The student session cookie's name, by the same rule Auth.js uses. */
export function sessionCookieName(requestUrl: string): string {
  return `${usesSecureCookie(requestUrl) ? "__Secure-" : ""}authjs.session-token`;
}

/**
 * Deletes the student session cookie and any Auth.js chunk cookies
 * (`<name>.0`, `<name>.1`, ...) it may have split a large token into, so a
 * stale chunk from a bygone session can never be read back as one.
 *
 * Must pass `secure` and `path` explicitly: ResponseCookies#delete's string
 * overload deletes with no `secure` attribute, and browsers silently reject
 * a Set-Cookie for a `__Secure-`-prefixed name that lacks Secure — so on
 * https the base cookie (and every chunk) would be left in place. See
 * node_modules/next/dist/compiled/@edge-runtime/cookies/index.js: `delete()`
 * (~line 302) calls `set({ ...options, name, value: "", expires: ... })`,
 * and `stringifyCookie` (~line 39) only appends `Secure` when
 * `"secure" in c && c.secure`.
 *
 * Kept free of database imports — the proxy calls it on every request.
 */
export function deleteSessionCookies(req: NextRequest, res: NextResponse): void {
  const cookieName = sessionCookieName(req.url);
  const secure = usesSecureCookie(req.url);
  for (const cookie of req.cookies.getAll()) {
    if (cookie.name === cookieName || cookie.name.startsWith(`${cookieName}.`)) {
      res.cookies.delete({ name: cookie.name, path: "/", secure });
    }
  }
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
