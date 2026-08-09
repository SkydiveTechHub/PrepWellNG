import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { changeUserPassword } from "@/lib/user-account";
import { changePasswordSchema } from "@/lib/validators";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verifies the current password, so it is a guessing oracle against a
  // borrowed or unattended session.
  const limit = rateLimit({
    key: `password:${session.user.id}`,
    limit: 5,
    windowSeconds: 900,
  });
  if (!limit.ok) return tooManyRequests(limit.retryAfterSeconds);

  try {
    const parsed = changePasswordSchema.safeParse(await req.json());

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { currentPassword, newPassword } = parsed.data;

    const result = await changeUserPassword(
      session.user.id,
      currentPassword,
      newPassword,
    );

    // Google-only accounts have no password to change. The UI hides this
    // section for them; this is the server-side counterpart.
    if (result === "no-password") {
      return NextResponse.json(
        { error: "This account signs in with Google and has no password" },
        { status: 400 },
      );
    }
    if (result === "wrong-password") {
      return NextResponse.json(
        { error: "Your current password is incorrect" },
        { status: 400 },
      );
    }

    return NextResponse.json({ message: "Password changed" });
  } catch (error) {
    console.error("Password change failed:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }
}
