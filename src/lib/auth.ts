import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "./db";
import { z } from "zod";

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

// Profile fields cached on the JWT at sign-in so the session callback can keep
// serving the chrome when the database is slow or briefly unreachable, instead
// of throwing a JWTSessionError that takes the whole request down with it.
type CachedProfile = {
  role?: string | null;
  classLevel?: string | null;
  track?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  image?: string | null;
};

/** How long a cached profile is served before the JWT callback re-reads it. */
const PROFILE_TTL_MS = 60_000;

const PROFILE_SELECT = {
  role: true,
  classLevel: true,
  track: true,
  firstName: true,
  lastName: true,
  image: true,
} as const;

// The session.user shape the callbacks extend — structural so it doesn't rely
// on next-auth's exact type export surface across beta versions.
type SessionUser = {
  id?: string | null;
  name?: string | null;
  email?: string | null;
  image?: string | null;
};

function applyProfile(sessionUser: SessionUser, profile: CachedProfile) {
  const extended = sessionUser as SessionUser & CachedProfile;
  extended.role = profile.role;
  extended.classLevel = profile.classLevel;
  extended.track = profile.track;
  extended.firstName = profile.firstName;
  extended.lastName = profile.lastName;
  extended.image = profile.image;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  session: { strategy: "jwt" },

  pages: {
    signIn: "/login",
    newUser: "/register",
  },

  providers: [
    // Google OAuth (only if configured)
    ...(process.env.AUTH_GOOGLE_ID &&
    process.env.AUTH_GOOGLE_ID !== "your-google-client-id" &&
    process.env.AUTH_GOOGLE_SECRET &&
    process.env.AUTH_GOOGLE_SECRET !== "your-google-client-secret"
      ? [
          Google({
            clientId: process.env.AUTH_GOOGLE_ID,
            clientSecret: process.env.AUTH_GOOGLE_SECRET,
          }),
        ]
      : []),

    // Email + Password
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;

        // Emails are stored lowercase/trimmed at registration; match the same
        // normalization here so casing differences never lock an account out.
        const user = await db.user.findUnique({
          where: { email: email.trim().toLowerCase() },
        });

        if (!user || !user.passwordHash) return null;

        const isValid = await bcrypt.compare(password, user.passwordHash);
        if (!isValid) return null;

        return {
          id: user.id,
          email: user.email,
          name: `${user.firstName} ${user.lastName}`,
          image: user.image,
        };
      },
    }),

  ],

  callbacks: {
    // Reads the token only. This used to query the database on *every* request
    // — a round-trip in front of every page render and every API call, before
    // the route had run a single query of its own.
    async session({ session, token }) {
      if (token.sub && session.user) {
        session.user.id = token.sub;
        const cached = (token as { profile?: CachedProfile }).profile;
        if (cached) applyProfile(session.user, cached);
      }
      return session;
    },

    // The profile cache is refreshed here instead, at most once per
    // PROFILE_TTL_MS. `trigger: "update"` forces it immediately.
    //
    // Tradeoff: a name or avatar change can take up to the TTL to appear in the
    // sidebar chrome. Only presentation data is cached — `role` is re-checked
    // against the database by the admin layout and every admin route handler,
    // so a stale token cannot grant access.
    async jwt({ token, user, trigger }) {
      const cache = token as { profile?: CachedProfile; profileAt?: number };
      const isSignIn = Boolean(user);

      if (isSignIn && user?.id) token.sub = user.id;
      if (!token.sub) return token;

      const expired =
        cache.profileAt == null || Date.now() - cache.profileAt > PROFILE_TTL_MS;

      if (!isSignIn && trigger !== "update" && !expired) return token;

      try {
        const profile = await db.user.findUnique({
          where: { id: token.sub },
          select: PROFILE_SELECT,
        });
        if (profile) {
          cache.profile = {
            role: profile.role,
            classLevel: profile.classLevel,
            track: profile.track,
            firstName: profile.firstName,
            lastName: profile.lastName,
            image: profile.image,
          };
          cache.profileAt = Date.now();
        }
      } catch {
        // Keep whatever is cached rather than throwing a JWTSessionError, which
        // would take the whole request down. Retried on the next expiry check.
      }

      return token;
    },
  },
});
