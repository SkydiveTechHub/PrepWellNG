import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SUBSCRIPTION_TIERS,
  TIER_LABELS,
  describeTier,
  hasAtLeast,
  isSubscriptionTier,
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
