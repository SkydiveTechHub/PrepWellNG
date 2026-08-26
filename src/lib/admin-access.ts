/**
 * Every admin authorization decision, as pure functions.
 *
 * These are deliberately database-free so they can be unit tested the way
 * `flashcard-ownership.ts` is. The database lookup that feeds them lives in
 * `admin-session.ts`; keeping the two apart is what makes the rules testable.
 */

export type AdminPrincipal = {
  id: string;
  isActive: boolean;
  isOwner: boolean;
};

/** Admins created through the console are always non-owners. */
export function canAccessConsole(
  admin: Pick<AdminPrincipal, "isActive"> | null,
): boolean {
  return admin?.isActive === true;
}

/** Creating and revoking admins is the owner's tier, not every admin's. */
export function canManageAdmins(
  admin: Pick<AdminPrincipal, "isActive" | "isOwner"> | null,
): boolean {
  return admin?.isActive === true && admin.isOwner === true;
}

/**
 * The owner row is never deactivatable — not by another admin, and not by the
 * owner themselves. Locking yourself out of your own console would leave the
 * bootstrap script as the only way back in.
 */
export function canDeactivate(
  target: { id: string; isOwner: boolean },
  actor: Pick<AdminPrincipal, "id" | "isActive" | "isOwner">,
): boolean {
  if (!canManageAdmins(actor)) return false;
  return !target.isOwner;
}

export type Identifier = { email: string } | { username: string };

const USERNAME_RE = /^[a-z0-9._-]{3,32}$/;
// Deliberately stricter than the RFC: one @, a dotted domain, no whitespace.
const EMAIL_RE = /^[^\s@]+@[^\s@.]+\.[^\s@]+$/;

/**
 * Resolves one typed value into the column it belongs in.
 *
 * Used by both the create path and the sign-in path so they cannot drift — if
 * they normalized differently, an admin would become uncreatable or
 * unreachable. Returns null for anything that is neither a valid email nor a
 * valid username, so a caller cannot store an unvalidated identifier.
 */
export function normalizeIdentifier(raw: string): Identifier | null {
  const value = raw.trim().toLowerCase();
  if (!value) return null;

  if (value.includes("@")) {
    return EMAIL_RE.test(value) ? { email: value } : null;
  }

  return USERNAME_RE.test(value) ? { username: value } : null;
}
