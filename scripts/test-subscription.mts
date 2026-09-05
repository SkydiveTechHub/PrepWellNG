import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SUBSCRIPTION_TIERS,
  TIER_LABELS,
  describeTier,
  hasAtLeast,
  isSubscriptionTier,
  BILLING_PERIODS,
  planFor,
  isPurchasableTier,
  formatNaira,
  SUBSCRIPTION_STATUSES,
  SUBSCRIPTION_SOURCES,
  ENTITLEMENTS,
  GATED_FEATURES,
  can,
} from "../src/lib/subscription";

test("the tiers are ordered cheapest to richest", () => {
  assert.deepEqual(SUBSCRIPTION_TIERS, ["FREEMIUM", "STANDARD", "PREMIUM"]);
});

test("a tier satisfies itself", () => {
  // Equal must pass, or every gate would demand a strict upgrade.
  for (const tier of SUBSCRIPTION_TIERS) {
    assert.equal(hasAtLeast({ tier }, tier), true, tier);
  }
});

test("a richer tier satisfies a poorer requirement", () => {
  assert.equal(hasAtLeast({ tier: "PREMIUM" }, "FREEMIUM"), true);
  assert.equal(hasAtLeast({ tier: "PREMIUM" }, "STANDARD"), true);
  assert.equal(hasAtLeast({ tier: "STANDARD" }, "FREEMIUM"), true);
});

test("a poorer tier does not satisfy a richer requirement", () => {
  assert.equal(hasAtLeast({ tier: "FREEMIUM" }, "STANDARD"), false);
  assert.equal(hasAtLeast({ tier: "FREEMIUM" }, "PREMIUM"), false);
  assert.equal(hasAtLeast({ tier: "STANDARD" }, "PREMIUM"), false);
});

test("every tier has a label", () => {
  for (const tier of SUBSCRIPTION_TIERS) {
    assert.equal(typeof TIER_LABELS[tier], "string");
    assert.ok(TIER_LABELS[tier].length > 0, tier);
  }
});

test("describeTier gives each tier a distinct tone", () => {
  const tones = SUBSCRIPTION_TIERS.map((tier) => describeTier({ tier }).tone);
  assert.equal(new Set(tones).size, SUBSCRIPTION_TIERS.length);
});

test("describeTier carries the label through", () => {
  assert.equal(describeTier({ tier: "PREMIUM" }).label, TIER_LABELS.PREMIUM);
});

test("isSubscriptionTier accepts only the three tiers", () => {
  // A hand-edited ?tier= must never reach Prisma as a where clause on an enum.
  assert.equal(isSubscriptionTier("STANDARD"), true);
  assert.equal(isSubscriptionTier("standard"), false);
  assert.equal(isSubscriptionTier("GOLD"), false);
  assert.equal(isSubscriptionTier(""), false);
  assert.equal(isSubscriptionTier(undefined), false);
  assert.equal(isSubscriptionTier(null), false);
});

test("the billing periods are monthly and yearly", () => {
  assert.deepEqual(BILLING_PERIODS, ["MONTHLY", "YEARLY"]);
});

test("every purchasable tier and period has a price", () => {
  for (const tier of ["STANDARD", "PREMIUM"] as const) {
    for (const period of BILLING_PERIODS) {
      assert.ok(planFor(tier, period).amountKobo > 0, `${tier} ${period}`);
    }
  }
});

test("prices match what the landing page sells", () => {
  assert.equal(planFor("STANDARD", "MONTHLY").amountKobo, 250_000);
  assert.equal(planFor("STANDARD", "YEARLY").amountKobo, 2_400_000);
  assert.equal(planFor("PREMIUM", "MONTHLY").amountKobo, 500_000);
  assert.equal(planFor("PREMIUM", "YEARLY").amountKobo, 5_000_000);
});

test("yearly is cheaper than twelve months", () => {
  // The landing page advertises "Save 20%" — if a repricing breaks that, the
  // claim on the marketing page becomes false.
  for (const tier of ["STANDARD", "PREMIUM"] as const) {
    const monthly = planFor(tier, "MONTHLY").amountKobo * 12;
    assert.ok(planFor(tier, "YEARLY").amountKobo < monthly, tier);
  }
});

test("freemium is free and not purchasable", () => {
  assert.equal(planFor("FREEMIUM", "MONTHLY").amountKobo, 0);
  assert.equal(isPurchasableTier("FREEMIUM"), false);
  assert.equal(isPurchasableTier("STANDARD"), true);
  assert.equal(isPurchasableTier("PREMIUM"), true);
});

test("the display names are the ones the landing page uses", () => {
  assert.equal(planFor("STANDARD", "MONTHLY").displayName, "Basic");
  assert.equal(planFor("PREMIUM", "MONTHLY").displayName, "Premium");
  assert.equal(planFor("FREEMIUM", "MONTHLY").displayName, "Free");
});

test("kobo renders as naira", () => {
  assert.equal(formatNaira(250_000), "₦2,500");
  assert.equal(formatNaira(0), "₦0");
});

test("the statuses and sources are the ones the schema will mirror", () => {
  assert.deepEqual(SUBSCRIPTION_STATUSES, [
    "PENDING",
    "ACTIVE",
    "FAILED",
    "ABANDONED",
    "REVOKED",
  ]);
  assert.deepEqual(SUBSCRIPTION_SOURCES, ["PAYSTACK", "COMP"]);
});

// --- Entitlements ---------------------------------------------------------

test("every gated feature declares a minimum tier", () => {
  for (const feature of GATED_FEATURES) {
    assert.ok(
      ENTITLEMENTS[feature] !== undefined,
      `${feature} has no minimum tier`,
    );
  }
});

test("the matrix matches what the landing page sells", () => {
  // src/components/landing/pricing.tsx is the promise made to buyers; if these
  // drift apart, the site is selling something the app does not grant.
  assert.equal(ENTITLEMENTS.flashcards, "STANDARD");
  assert.equal(ENTITLEMENTS.studyPlanner, "STANDARD");
  assert.equal(ENTITLEMENTS.premiumLibrary, "PREMIUM");
  assert.equal(ENTITLEMENTS.advancedAnalytics, "PREMIUM");
});

test("freemium gets none of the gated features", () => {
  for (const feature of GATED_FEATURES) {
    assert.equal(can("FREEMIUM", feature), false, feature);
  }
});

test("premium gets all of them", () => {
  for (const feature of GATED_FEATURES) {
    assert.equal(can("PREMIUM", feature), true, feature);
  }
});

test("standard gets the standard features but not the premium ones", () => {
  assert.equal(can("STANDARD", "flashcards"), true);
  assert.equal(can("STANDARD", "studyPlanner"), true);
  assert.equal(can("STANDARD", "premiumLibrary"), false);
  assert.equal(can("STANDARD", "advancedAnalytics"), false);
});

test("can() is rank-based, so a richer tier never loses a feature", () => {
  // Guards the ordering invariant directly: anything a lower tier can do, every
  // higher tier can do. A matrix edit that breaks this is a downgrade bug.
  for (const feature of GATED_FEATURES) {
    if (can("FREEMIUM", feature)) {
      assert.equal(can("STANDARD", feature), true, feature);
    }
    if (can("STANDARD", feature)) {
      assert.equal(can("PREMIUM", feature), true, feature);
    }
  }
});
