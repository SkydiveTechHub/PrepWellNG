import Link from "next/link";
import { buttonClass } from "@/components/ui/button";
import { currentEntitlement } from "@/lib/billing/subscription-data";
import { TIER_DISPLAY_NAMES } from "@/lib/subscription";
import { Section } from "@/components/settings/section";

/**
 * The entry point to the buying flow. It reads the entitlement rows rather than
 * the cached `User.tier` column so a plan that lapsed since the session token
 * was minted shows as lapsed here.
 */
export async function SubscriptionSection({ userId }: { userId: string }) {
  const { tier, expiresAt } = await currentEntitlement(userId);
  const onTopTier = tier === "PREMIUM";

  return (
    <Section
      title="Subscription"
      description="Your plan controls how much of PrepWell you can use."
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm text-foreground">
          You are on <strong>{TIER_DISPLAY_NAMES[tier]}</strong>
          {expiresAt
            ? `, until ${expiresAt.toLocaleDateString("en-NG", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}.`
            : "."}
        </p>

        <Link
          href="/settings/billing"
          className={buttonClass(onTopTier ? "outline" : "primary", "md")}
        >
          {onTopTier ? "Manage plan" : "Upgrade plan"}
        </Link>
      </div>
    </Section>
  );
}
