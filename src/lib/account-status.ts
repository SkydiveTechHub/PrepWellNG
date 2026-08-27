/**
 * Student account status rules, as pure functions.
 *
 * Suspension has to bite on a session that is already live, not only at the
 * next sign-in: student sessions are JWT with a 60s profile refresh
 * (PROFILE_TTL_MS in auth.ts), so a suspended student would otherwise keep
 * browsing on a token nobody re-checks. `isSessionRevoked` is the rule the jwt
 * callback applies on that refresh; keeping it here is what makes it testable
 * without booting NextAuth.
 *
 * See docs/superpowers/specs/2026-08-27-admin-console-structure-design.md
 */

export const ACCOUNT_STATUSES = ["active", "suspended"] as const;

export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export type AccountStatusFields = {
  isActive: boolean;
  sessionsValidFrom: Date | null;
};

export function isAccountStatus(
  value: string | undefined | null,
): value is AccountStatus {
  return (
    typeof value === "string" &&
    (ACCOUNT_STATUSES as readonly string[]).includes(value)
  );
}

/**
 * Whether a live token should be rejected.
 *
 * @param tokenIssuedAtSeconds the JWT `iat` claim — SECONDS since the epoch,
 *   not milliseconds. Undefined when the claim is absent.
 */
export function isSessionRevoked(
  account: AccountStatusFields,
  tokenIssuedAtSeconds: number | undefined,
): boolean {
  if (!account.isActive) return true;
  if (account.sessionsValidFrom === null) return false;

  // No issued-at claim means the token cannot prove it is newer than the
  // revocation, so it does not get the benefit of the doubt.
  if (tokenIssuedAtSeconds === undefined) return true;

  const validFromSeconds = Math.floor(account.sessionsValidFrom.getTime() / 1000);

  // `<=` not `<`: iat has second granularity, so a token stamped in the same
  // second as the revocation could be the one being revoked.
  return tokenIssuedAtSeconds <= validFromSeconds;
}

export function describeAccountStatus(account: { isActive: boolean }): {
  label: string;
  tone: "success" | "warning";
} {
  return account.isActive
    ? { label: "Active", tone: "success" }
    : { label: "Suspended", tone: "warning" };
}
