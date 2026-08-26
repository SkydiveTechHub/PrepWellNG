/**
 * Admin routing constants, deliberately free of framework and database
 * imports so `src/proxy.ts` can use them. Importing these from
 * `admin-auth.ts` would pull NextAuth and Prisma into the proxy bundle,
 * which cannot run them.
 */

export const ADMIN_SESSION_COOKIE = "prepwell.admin-session";
export const ADMIN_AUTH_BASE_PATH = "/admin/api/auth";
