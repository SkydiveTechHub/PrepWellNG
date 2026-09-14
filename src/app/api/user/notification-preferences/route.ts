import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { notificationPreferencesSchema } from "@/lib/push-validators";
import { updatePreferences } from "@/lib/push-subscription-data";

export const dynamic = "force-dynamic";

// PATCH /api/user/notification-preferences — toggles apply to every device
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = notificationPreferencesSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  try {
    return NextResponse.json(await updatePreferences(session.user.id, parsed.data));
  } catch (error) {
    console.error("Updating notification preferences failed:", error);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
