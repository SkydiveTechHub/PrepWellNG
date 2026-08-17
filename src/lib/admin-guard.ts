import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export type AdminActor = { id: string };

export type AdminGuardResult =
  | { ok: true; actor: AdminActor }
  | { ok: false; response: NextResponse };

/**
 * Whether the user holds the ADMIN role. Always read from the database — the
 * JWT caches a `role` for presentation, but it is never trusted for access.
 */
export async function isAdminUser(userId: string): Promise<boolean> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  return user?.role === "ADMIN";
}

/**
 * Resolves the signed-in admin, or the response the caller should return
 * instead. The session lookup and the role lookup were previously duplicated
 * verbatim in every admin handler, so a fix to one never reached the others.
 */
export async function requireAdmin(): Promise<AdminGuardResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  if (!(await isAdminUser(session.user.id))) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Admin access required" },
        { status: 403 },
      ),
    };
  }

  return { ok: true, actor: { id: session.user.id } };
}
