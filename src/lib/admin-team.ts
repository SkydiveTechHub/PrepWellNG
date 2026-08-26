import { db } from "./db";
import type { Identifier } from "./admin-access";

/**
 * Database access for the owner-only /admin/team screen. Kept apart from
 * `admin-access` (pure authorization rules) so those stay database-free and
 * unit-testable, matching the split `admin-data.ts` uses for the rest of the
 * console.
 */

export type TeamAdminRow = {
  id: string;
  email: string | null;
  username: string | null;
  isOwner: boolean;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
};

const TEAM_SELECT = {
  id: true,
  email: true,
  username: true,
  isOwner: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
} as const;

export function listAdmins(): Promise<TeamAdminRow[]> {
  return db.admin.findMany({
    select: TEAM_SELECT,
    orderBy: [{ isOwner: "desc" }, { createdAt: "asc" }],
  });
}

export function createAdmin(
  identifier: Identifier,
  passwordHash: string,
  createdById: string,
): Promise<TeamAdminRow> {
  return db.admin.create({
    data: {
      ...identifier,
      passwordHash,
      // Admins created through this console are always non-owners — the
      // single-owner invariant only ever gets an exception in
      // scripts/create-admin.ts, never from a request.
      isOwner: false,
      createdById,
    },
    select: TEAM_SELECT,
  });
}

export function findAdminForStatusChange(
  id: string,
): Promise<{ id: string; email: string | null; username: string | null; isOwner: boolean } | null> {
  return db.admin.findUnique({
    where: { id },
    select: { id: true, email: true, username: true, isOwner: true },
  });
}

export function setAdminActive(id: string, isActive: boolean): Promise<void> {
  return db.admin.update({ where: { id }, data: { isActive } }).then(() => undefined);
}
