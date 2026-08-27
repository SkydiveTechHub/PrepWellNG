/**
 * The subscription tier seam.
 *
 * Deliberately database-free — the tier union is declared here rather than
 * imported from `@prisma/client`, the same way `curriculum-scope.ts` declares
 * CLASS_LEVELS. That is what lets the rules be unit tested without a database.
 * The Prisma `SubscriptionTier` enum carries exactly these three members.
 *
 * What each tier UNLOCKS is deliberately not defined here yet. When that
 * decision is made it becomes one table in this file; call sites only ever ask
 * `hasAtLeast`, so none of them change.
 *
 * See docs/superpowers/specs/2026-08-27-admin-console-structure-design.md
 */

export const SUBSCRIPTION_TIERS = ["FREEMIUM", "STANDARD", "PREMIUM"] as const;

export type SubscriptionTier = (typeof SUBSCRIPTION_TIERS)[number];

export const TIER_LABELS: Record<SubscriptionTier, string> = {
  FREEMIUM: "Freemium",
  STANDARD: "Standard",
  PREMIUM: "Premium",
};

/** Rank, not identity — comparisons must survive a tier being inserted later. */
const TIER_RANK: Record<SubscriptionTier, number> = {
  FREEMIUM: 0,
  STANDARD: 1,
  PREMIUM: 2,
};

const TIER_TONE: Record<SubscriptionTier, "neutral" | "info" | "success"> = {
  FREEMIUM: "neutral",
  STANDARD: "info",
  PREMIUM: "success",
};

export function isSubscriptionTier(
  value: string | undefined | null,
): value is SubscriptionTier {
  return (
    typeof value === "string" &&
    (SUBSCRIPTION_TIERS as readonly string[]).includes(value)
  );
}

/**
 * The single predicate every future entitlement gate calls.
 *
 * Equal tiers pass: a STANDARD feature is available to a STANDARD subscriber.
 */
export function hasAtLeast(
  account: { tier: SubscriptionTier },
  required: SubscriptionTier,
): boolean {
  return TIER_RANK[account.tier] >= TIER_RANK[required];
}

export function describeTier(account: { tier: SubscriptionTier }): {
  label: string;
  tone: "neutral" | "info" | "success";
} {
  return { label: TIER_LABELS[account.tier], tone: TIER_TONE[account.tier] };
}
