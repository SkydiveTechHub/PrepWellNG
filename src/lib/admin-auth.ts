import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "./db";
import { normalizeIdentifier } from "./admin-access";
import { ADMIN_SESSION_COOKIE, ADMIN_AUTH_BASE_PATH } from "./admin-route";

/**
 * The admin authentication instance — entirely separate from `auth.ts`.
 *
 * Separate secret, separate cookie, separate base path. The two sessions
 * coexist in one browser because their cookies share no name and no scope, so
 * you can hold the console open in one tab and a student account in another.
 */

/** A working day. The console can rewrite the entire question bank. */
const SESSION_MAX_AGE = 60 * 60 * 8;

const useSecureCookies = process.env.NODE_ENV === "production";

// NextAuth's own default (node_modules/next-auth/lib/env.js) does
// `config.secret ??= process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET`.
// So an unset ADMIN_AUTH_SECRET would silently make this instance sign ADMIN
// tokens with the STUDENT secret — collapsing the separation this file exists
// to enforce, and letting a leaked student secret forge admin sessions.
// Failing loudly at boot beats shipping forging-capable tokens to production.
if (
  !process.env.ADMIN_AUTH_SECRET ||
  process.env.ADMIN_AUTH_SECRET === process.env.AUTH_SECRET
) {
  throw new Error(
    "ADMIN_AUTH_SECRET is missing or identical to AUTH_SECRET. Generate a " +
      "distinct value with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\" " +
      "and set it as ADMIN_AUTH_SECRET. It must differ from AUTH_SECRET, or a " +
      "leaked student secret could forge admin tokens.",
  );
}

/**
 * Scoped to /admin, which is why the admin API lives under that same prefix
 * (at /admin/api): the browser must send this cookie to the API routes, and
 * must never send it to a student route.
 */
const cookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  path: "/admin",
  secure: useSecureCookies,
} as const;

export const {
  handlers: adminHandlers,
  auth: adminAuth,
  signIn: adminSignIn,
  signOut: adminSignOut,
} = NextAuth({
  basePath: ADMIN_AUTH_BASE_PATH,
  secret: process.env.ADMIN_AUTH_SECRET,
  session: { strategy: "jwt", maxAge: SESSION_MAX_AGE },

  cookies: {
    sessionToken: { name: ADMIN_SESSION_COOKIE, options: cookieOptions },
    callbackUrl: {
      name: "prepwell.admin-callback-url",
      options: cookieOptions,
    },
    csrfToken: {
      name: "prepwell.admin-csrf-token",
      options: cookieOptions,
    },
  },

  pages: { signIn: "/admin/login" },

  providers: [
    Credentials({
      name: "admin-credentials",
      credentials: {
        identifier: { label: "Email or username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const rawIdentifier = credentials?.identifier;
        const password = credentials?.password;
        if (typeof rawIdentifier !== "string" || typeof password !== "string") {
          return null;
        }

        const identifier = normalizeIdentifier(rawIdentifier);
        if (!identifier) return null;

        const admin = await db.admin.findFirst({
          where: identifier,
          select: { id: true, passwordHash: true, isActive: true },
        });

        // Deactivated admins are refused at the door as well as at every
        // request, so revoking access does not depend on a cookie expiring.
        if (!admin || !admin.isActive) return null;
        if (!(await bcrypt.compare(password, admin.passwordHash))) return null;

        await db.admin.update({
          where: { id: admin.id },
          data: { lastLoginAt: new Date() },
        });

        return { id: admin.id };
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) token.sub = user.id;
      return token;
    },

    // Carries the id only. isActive and isOwner are deliberately absent: they
    // are authorization facts, and authorization is re-read from the database
    // by admin-session.ts on every request.
    async session({ session, token }) {
      if (token.sub && session.user) session.user.id = token.sub;
      return session;
    },
  },
});
