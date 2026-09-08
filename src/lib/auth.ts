import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "./db";
import { z } from "zod";
import { isSessionRevoked, sessionStartedAt } from "@/lib/account-status";
import { resolveTier } from "@/lib/billing/entitlement";
import type { SubscriptionTier } from "@/lib/subscription";

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
  // Unlike the fields above, this one is not decoration: entitlement gates read
  // it. PROFILE_SELECT already fetched it to refresh the User.tier cache below,
  // so carrying it costs no extra query. It can lag the database by up to
  // PROFILE_TTL_MS, which is why a paid upgrade calls session.update() to force
  // the `trigger: "update"` refresh instead of leaving the buyer locked out.
  tier?: SubscriptionTier | null;
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
  isActive: true,
  sessionsValidFrom: true,
  tier: true,
  subscriptions: {
    where: { status: "ACTIVE" },
    select: { tier: true, status: true, startsAt: true, endsAt: true },
  },
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
  extended.tier = profile.tier;
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

        // A suspended account must not be able to start a new session. The jwt
        // callback below handles the sessions that are already live.
        //
        // This gate covers the Credentials provider only — authorize() never
        // runs for OAuth. A suspended Google-linked student is still blocked,
        // just not here: on OAuth sign-in the jwt callback runs with
        // isSignIn === true, which makes the `!isSignIn && …` TTL fast-path
        // false, so the callback always reaches the profile fetch and the
        // revocation check below, which returns null. Don't "fix" this by
        // adding a parallel gate for Google — enforcement already holds via
        // that path.
        if (!user.isActive) return null;

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
    // sidebar chrome. Only presentation data is cached — `role` is display-only
    // here. Admin access is no longer gated by `User.role` at all: admins live
    // in a separate `Admin` table, authenticated by the entirely separate
    // instance in admin-auth.ts, so this cached role cannot grant admin access.
    async jwt({ token, user, trigger }) {
      const cache = token as {
        profile?: CachedProfile;
        profileAt?: number;
        sessionStartedAt?: number;
      };
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
        // A user row that no longer exists has no session. `findUnique`
        // returning null is authoritative here: a database outage THROWS and
        // is caught below, keeping the cached profile, so null means the row
        // is genuinely gone — deleted. Without this, a deleted student's token
        // stays valid until it expires, while a merely suspended student's is
        // revoked within the TTL — the more severe action getting the weaker
        // enforcement.
        if (!profile) return null;

        // Suspension and force sign-out have to bite on a token that is
        // already live, not only at the next sign-in. This runs at most once
        // per PROFILE_TTL_MS, so the delay is bounded by that.
        const startedAt = sessionStartedAt({
          isSignIn,
          storedStartedAt: cache.sessionStartedAt,
          tokenIssuedAt: token.iat,
          nowSeconds: Math.floor(Date.now() / 1000),
        });
        if (isSignIn) cache.sessionStartedAt = startedAt;

        if (isSessionRevoked(profile, startedAt)) {
          return null;
        }

        // User.tier is a cache of what the subscription rows grant. Refresh it
        // here rather than on a schedule: this read already runs at most once
        // per PROFILE_TTL_MS, so an expiry converges within that window and an
        // upgrade is instant because applyChargeSuccess writes it directly.
        const resolved = resolveTier(
          profile.subscriptions as {
            tier: SubscriptionTier;
            status: "ACTIVE";
            startsAt: Date | null;
            endsAt: Date | null;
          }[],
          new Date(),
        );
        if (resolved.tier !== profile.tier) {
          await db.user
            .update({
              where: { id: token.sub },
              data: { tier: resolved.tier, tierUpdatedAt: new Date() },
            })
            // A failed refresh must never cost the user their session — the
            // surrounding catch keeps the cached profile on a database blip,
            // and the next TTL expiry tries again.
            .catch(() => {});
        }

        cache.profile = {
          role: profile.role,
          classLevel: profile.classLevel,
          track: profile.track,
          firstName: profile.firstName,
          lastName: profile.lastName,
          image: profile.image,
          // `resolved.tier`, not `profile.tier`: the column was read before the
          // refresh above and may be the value we just corrected. Caching the
          // stale one would hold a just-upgraded buyer at their old tier for a
          // further PROFILE_TTL_MS.
          tier: resolved.tier,
        };
        cache.profileAt = Date.now();
      } catch {
        // Keep whatever is cached rather than throwing a JWTSessionError, which
        // would take the whole request down. Retried on the next expiry check.
      }

      return token;
    },
  },
});
