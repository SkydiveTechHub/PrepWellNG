import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { updateProfileSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const parsed = updateProfileSchema.safeParse(await req.json());

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { firstName, lastName, phone, state, classLevel, track } = parsed.data;

    // Build the update from present keys only, so the profile section never
    // overwrites the academic section's fields and vice versa.
    const data: Prisma.UserUpdateInput = {};
    if (firstName !== undefined) data.firstName = firstName;
    if (lastName !== undefined) data.lastName = lastName;
    if (classLevel !== undefined) data.classLevel = classLevel;
    if (track !== undefined) data.track = track;
    // A cleared field must become NULL, not "": the unique index on phone
    // would otherwise collide across every user who left it blank.
    if (phone !== undefined) data.phone = phone || null;
    if (state !== undefined) data.state = state || null;

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    const user = await db.user.update({
      // Always the session's own id — never one supplied by the caller.
      where: { id: session.user.id },
      data,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        state: true,
        classLevel: true,
        track: true,
      },
    });

    return NextResponse.json({ message: "Profile updated", user });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "That phone number is already linked to another account" },
        { status: 409 },
      );
    }

    console.error("Profile update failed:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }
}
