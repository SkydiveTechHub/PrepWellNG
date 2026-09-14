import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { denyUnlessEntitled } from "@/lib/entitlements";

/**
 * Signed in and entitled to the study planner. The planner is a paid feature,
 * enforced here: hiding the page does not stop a direct call to these routes.
 */
export async function requireStudyPlanner(): Promise<
  { ok: true; userId: string } | { ok: false; response: NextResponse }
> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const denied = await denyUnlessEntitled(session, "studyPlanner");
  if (denied) return { ok: false, response: denied };
  return { ok: true, userId: session.user.id };
}
