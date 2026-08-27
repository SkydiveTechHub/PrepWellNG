/**
 * Admin routing constants, deliberately free of framework and database
 * imports so `src/proxy.ts` can use them. Importing these from
 * `admin-auth.ts` would pull NextAuth and Prisma into the proxy bundle,
 * which cannot run them.
 */

export const ADMIN_SESSION_COOKIE = "prepwell.admin-session";
export const ADMIN_AUTH_BASE_PATH = "/admin/api/auth";

/**
 * Which admin rule a path falls under. Extracted from the proxy so the
 * boundary cases — /administration, /admin/loginsomething — are testable
 * without booting Next.
 */
export type AdminPathKind = "auth" | "login" | "console";

export function classifyAdminPath(pathname: string): AdminPathKind | null {
  if (pathname !== "/admin" && !pathname.startsWith("/admin/")) return null;
  if (pathname === "/admin/api/auth" || pathname.startsWith("/admin/api/auth/")) return "auth";
  if (pathname === "/admin/login") return "login";
  return "console";
}

/**
 * Whether a redirect target is a real path inside the admin console.
 *
 * `startsWith("/admin")` alone would accept `/adminXYZ`; the boundary check is
 * what makes this a path test rather than a string test. Protocol-relative
 * URLs (`//evil.example`) are rejected because the browser treats them as
 * absolute.
 */
export function isAdminPath(pathname: string): boolean {
  if (pathname.startsWith("//")) return false;
  return pathname === "/admin" || pathname.startsWith("/admin/");
}
