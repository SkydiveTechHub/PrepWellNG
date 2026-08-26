import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { adminAuth } from "./admin-auth";
import { db } from "./db";
import {
  canAccessConsole,
  canManageAdmins,
  type AdminPrincipal,
} from "./admin-access";

/**
 * The single place admin identity is resolved.
 *
 * This — not the proxy and not a layout — is the wall. The proxy check is
 * optimistic and can be outrun by a stale cookie; Next's own docs state it
 * "should not be used as a full session management or authorization solution".
 * A layout check is skipped by Partial Rendering on client-side navigation
 * between admin routes, which is exactly how the previous implementation was
 * weak.
 */

export type AdminGuardResult =
  | { ok: true; actor: AdminPrincipal }
  | { ok: false; response: NextResponse };

/** Always reads the row, so deactivation takes effect on the next request. */
export async function getAdminPrincipal(): Promise<AdminPrincipal | null> {
  const session = await adminAuth();
  const id = session?.user?.id;
  if (!id) return null;

  return db.admin.findUnique({
    where: { id },
    select: { id: true, isActive: true, isOwner: true },
  });
}

export async function requireAdminPage(): Promise<AdminPrincipal> {
  const admin = await getAdminPrincipal();
  if (!canAccessConsole(admin)) redirect("/admin/login");
  return admin as AdminPrincipal;
}

export async function requireOwnerPage(): Promise<AdminPrincipal> {
  const admin = await getAdminPrincipal();
  if (!canAccessConsole(admin)) redirect("/admin/login");
  // Signed in but not the owner: back to the console, not to the login page.
  if (!canManageAdmins(admin)) redirect("/admin");
  return admin as AdminPrincipal;
}

export async function requireAdminApi(): Promise<AdminGuardResult> {
  const admin = await getAdminPrincipal();
  if (!canAccessConsole(admin)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  return { ok: true, actor: admin as AdminPrincipal };
}

export async function requireOwnerApi(): Promise<AdminGuardResult> {
  const admin = await getAdminPrincipal();
  if (!canAccessConsole(admin)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  if (!canManageAdmins(admin)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Owner access required" },
        { status: 403 },
      ),
    };
  }
  return { ok: true, actor: admin as AdminPrincipal };
}
