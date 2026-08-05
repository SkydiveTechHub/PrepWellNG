import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { ClassLevel, Track } from "@prisma/client";
import { db } from "@/lib/db";
import { registerSchema } from "@/lib/validators";
import { clientKey, rateLimit, tooManyRequests } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    // Unauthenticated and it runs bcrypt, so it is both the account-creation
    // spam surface and a cheap way to burn server CPU.
    const limit = rateLimit({
      key: clientKey(req, "register"),
      limit: 5,
      windowSeconds: 600,
    });
    if (!limit.ok) return tooManyRequests(limit.retryAfterSeconds);

    const body = await req.json();
    const parsed = registerSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { firstName, lastName, password, classLevel, track, state } =
      parsed.data;
    // Store emails normalized so the credentials provider (which lowercases on
    // every login) can always find the row regardless of how it's typed.
    const email = parsed.data.email.trim().toLowerCase();

    // Check if user already exists
    const existing = await db.user.findUnique({
      where: { email },
    });

    if (existing) {
      return NextResponse.json(
        { error: "An account with this email already exists" },
        { status: 409 }
      );
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Create user
    const user = await db.user.create({
      data: {
        firstName,
        lastName,
        email,
        passwordHash,
        classLevel: classLevel as ClassLevel,
        track: track as Track,
        state,
        role: "STUDENT",
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        classLevel: true,
        track: true,
      },
    });

    return NextResponse.json(
      { message: "Account created successfully", user },
      { status: 201 }
    );
  } catch (error) {
    console.error("Registration error:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
