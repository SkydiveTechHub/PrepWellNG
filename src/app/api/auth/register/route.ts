import { NextRequest, NextResponse } from "next/server";
import { ClassLevel, Track } from "@prisma/client";
import { registerUser } from "@/lib/user-account";
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

    const { role, firstName, lastName, email, password, classLevel, track, state } =
      parsed.data;

    const user = await registerUser({
      firstName,
      lastName,
      email,
      password,
      classLevel: classLevel as ClassLevel,
      track: track as Track,
      state,
      role,
    });

    if (user === "email-taken") {
      return NextResponse.json(
        { error: "An account with this email already exists" },
        { status: 409 }
      );
    }

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
