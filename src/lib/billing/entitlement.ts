/**
 * Which tier a set of subscription rows grants right now.
 *
 * This is the rule `User.tier` caches. Any hard entitlement gate must call
 * this against live rows; `User.tier` is for chrome, admin lists, and
 * analytics, and can lag an expiry by up to the auth profile TTL.
 *
 * Database-free, so every boundary below is unit tested without a database.
 */

import {
  SUBSCRIPTION_TIERS,
  type SubscriptionStatus,
  type SubscriptionTier,
} from "@/lib/subscription";

export type EntitlementRow = {
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  startsAt: Date | null;
  endsAt: Date | null;
};

export type Entitlement = {
  tier: SubscriptionTier;
  /** When the granting tier lapses, or null when nothing is granted. */
  expiresAt: Date | null;
};

/** Rank by position in the tier union, which is ordered cheapest to richest. */
function rank(tier: SubscriptionTier): number {
  return SUBSCRIPTION_TIERS.indexOf(tier);
}

function covers(row: EntitlementRow, now: number): boolean {
  if (row.status !== "ACTIVE") return false;
  // A row with no end is not an endless grant — it is an unfinished write.
  if (!row.endsAt) return false;
  if (row.startsAt && row.startsAt.getTime() > now) return false;
  // Exclusive: a term ending at exactly `now` has ended.
  return row.endsAt.getTime() > now;
}

export function resolveTier(
  rows: readonly EntitlementRow[],
  now: Date,
): Entitlement {
  const live = rows.filter((row) => covers(row, now.getTime()));
  if (live.length === 0) return { tier: "FREEMIUM", expiresAt: null };

  // Richest wins, not newest: a comped PREMIUM overlapping a paid STANDARD
  // resolves in the student's favour.
  const tier = live.reduce(
    (best, row) => (rank(row.tier) > rank(best) ? row.tier : best),
    live[0].tier,
  );

  const expiresAt = live
    .filter((row) => row.tier === tier)
    .reduce<Date | null>(
      (furthest, row) =>
        !furthest || row.endsAt!.getTime() > furthest.getTime()
          ? row.endsAt!
          : furthest,
      null,
    );

  return { tier, expiresAt };
}
