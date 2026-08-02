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

        const user = await db.user.findUnique({
          where: { email },
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

    // Phone OTP — handled via custom API route
    // See /api/auth/send-otp and /api/auth/verify-otp
  ],

  callbacks: {
    async session({ session, token }) {
      if (token.sub && session.user) {
        session.user.id = token.sub;

        // Fetch additional user data
        const user = await db.user.findUnique({
          where: { id: token.sub },
          select: {
            role: true,
            classLevel: true,
            track: true,
            firstName: true,
            lastName: true,
            image: true,
          },
        });

        if (user) {
          const extendedUser = session.user as typeof session.user & {
            role?: string | null;
            classLevel?: string | null;
            track?: string | null;
            firstName?: string | null;
            lastName?: string | null;
          };
          extendedUser.role = user.role;
          extendedUser.classLevel = user.classLevel;
          extendedUser.track = user.track;
          extendedUser.firstName = user.firstName;
          extendedUser.lastName = user.lastName;
          // Read from the database, not the JWT — the token still holds
          // whatever image was set at sign-in and goes stale after an upload.
          session.user.image = user.image;
        }
      }
      return session;
    },

    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
      }
      return token;
    },
  },
});
