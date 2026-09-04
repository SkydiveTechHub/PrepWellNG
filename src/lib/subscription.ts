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

// ─── Billing ──────────────────────────────────────────────
//
// Declared here, not imported from `@prisma/client`, for the same reason the
// tier union is: it keeps every billing rule unit-testable without a database.
// The Prisma enums added alongside the Subscription model mirror these exactly.

export const BILLING_PERIODS = ["MONTHLY", "YEARLY"] as const;
export type BillingPeriod = (typeof BILLING_PERIODS)[number];

export const SUBSCRIPTION_STATUSES = [
  "PENDING",
  "ACTIVE",
  "FAILED",
  "ABANDONED",
  "REVOKED",
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const SUBSCRIPTION_SOURCES = ["PAYSTACK", "COMP"] as const;
export type SubscriptionSource = (typeof SUBSCRIPTION_SOURCES)[number];

/**
 * What the marketing site calls each tier. Deliberately different from
 * TIER_LABELS: the landing page sells "Basic", the admin console says
 * "Standard", and both are correct for their audience.
 */
export const TIER_DISPLAY_NAMES: Record<SubscriptionTier, string> = {
  FREEMIUM: "Free",
  STANDARD: "Basic",
  PREMIUM: "Premium",
};

export const PERIOD_LABELS: Record<BillingPeriod, string> = {
  MONTHLY: "Monthly",
  YEARLY: "Yearly",
};

/** Kobo, because that is the unit the Paystack API takes. */
const PLAN_PRICES_KOBO: Record<
  SubscriptionTier,
  Record<BillingPeriod, number>
> = {
  FREEMIUM: { MONTHLY: 0, YEARLY: 0 },
  STANDARD: { MONTHLY: 250_000, YEARLY: 2_400_000 },
  PREMIUM: { MONTHLY: 500_000, YEARLY: 5_000_000 },
};

export type Plan = {
  tier: SubscriptionTier;
  period: BillingPeriod;
  amountKobo: number;
  displayName: string;
};

export function planFor(tier: SubscriptionTier, period: BillingPeriod): Plan {
  return {
    tier,
    period,
    amountKobo: PLAN_PRICES_KOBO[tier][period],
    displayName: TIER_DISPLAY_NAMES[tier],
  };
}

/** FREEMIUM is the absence of a subscription, so it can never be bought. */
export function isPurchasableTier(tier: SubscriptionTier): boolean {
  return tier !== "FREEMIUM";
}

export function formatNaira(kobo: number): string {
  return `₦${Math.round(kobo / 100).toLocaleString("en-NG")}`;
}
