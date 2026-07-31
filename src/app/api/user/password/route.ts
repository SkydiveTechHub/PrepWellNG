import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { changePasswordSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const parsed = changePasswordSchema.safeParse(await req.json());

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { currentPassword, newPassword } = parsed.data;

    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: { passwordHash: true },
    });

    // Google-only accounts have no password to change. The UI hides this
    // section for them; this is the server-side counterpart.
    if (!user?.passwordHash) {
      return NextResponse.json(
        { error: "This account signs in with Google and has no password" },
        { status: 400 },
      );
    }

    const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isValid) {
      return NextResponse.json(
        { error: "Your current password is incorrect" },
        { status: 400 },
      );
    }

    await db.user.update({
      where: { id: session.user.id },
      // Same cost factor as registration.
      data: { passwordHash: await bcrypt.hash(newPassword, 12) },
    });

    return NextResponse.json({ message: "Password changed" });
  } catch (error) {
    console.error("Password change failed:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }
}
