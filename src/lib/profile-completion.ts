import { isNigerianState } from "@/lib/constants/exam-types";

/**
 * Whether a student has given the details the app needs before the dashboard:
 * class level and track shape every learning page, and state feeds the admin
 * demographics. Google sign-ups skip the register form and have none of them;
 * older accounts may lack a state or hold free text from before it was a list.
 *
 * Pure — no Prisma, no session — so the gate is testable on its own.
 */

type ProfileFields = {
  classLevel?: string | null;
  track?: string | null;
  state?: string | null;
};

function fieldMissing(field: keyof ProfileFields, value: string | null): boolean {
  if (!value) return true;
  return field === "state" && !isNigerianState(value);
}

/** For a database row, where every field is present (possibly null). */
export function isProfileComplete(row: ProfileFields): boolean {
  return (["classLevel", "track", "state"] as const).every(
    (field) => !fieldMissing(field, row[field] ?? null),
  );
}

/**
 * For the cached session profile, which can lag or lack fields: a token minted
 * before `state` was cached has no such key, and a failed sign-in read caches
 * nothing. An absent field is unknown, not missing — gating on it would bounce
 * a student whose row is complete between the dashboard and /complete-profile.
 * Only a field the cache positively holds as missing redirects.
 */
export function needsProfileCompletion(user: ProfileFields): boolean {
  return (["classLevel", "track", "state"] as const).some(
    (field) => user[field] !== undefined && fieldMissing(field, user[field]),
  );
}
