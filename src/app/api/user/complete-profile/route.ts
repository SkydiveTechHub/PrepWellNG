import { NextRequest, NextResponse } from "next/server";
import { auth, updateSession } from "@/lib/auth";
import { updateUserProfile } from "@/lib/user-account";
import { completeProfileSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

// The /complete-profile form. Separate from PATCH /api/user/profile because
// every field is required here, and because the save must refresh the session
// before responding: the dashboard gate reads the cached profile, and without
// the refresh it would send the student straight back to the form for up to a
// minute.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const parsed = completeProfileSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: parsed.error.issues[0]?.message ?? "Validation failed",
          details: parsed.error.flatten(),
        },
        { status: 400 },
      );
    }

    // Only class, track and state are in the patch, so "nothing-to-update"
    // and "phone-taken" cannot come back.
    await updateUserProfile(session.user.id, parsed.data);
    await updateSession({});

    return NextResponse.json({ message: "Profile completed" });
  } catch (error) {
    console.error("Profile completion failed:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }
}
