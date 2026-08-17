import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { updateUserProfile } from "@/lib/user-account";
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

    const result = await updateUserProfile(session.user.id, parsed.data);

    if (result === "nothing-to-update") {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }
    if (result === "phone-taken") {
      return NextResponse.json(
        { error: "That phone number is already linked to another account" },
        { status: 409 },
      );
    }

    return NextResponse.json({ message: "Profile updated", user: result });
  } catch (error) {
    console.error("Profile update failed:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }
}
