import Link from "next/link";
import { LuLock } from "react-icons/lu";
import { buttonClass } from "@/components/ui/button";
import { TIER_DISPLAY_NAMES, type SubscriptionTier } from "@/lib/subscription";

/**
 * What a gated surface renders instead of the feature.
 *
 * Deliberately not a 404 or an empty state: someone who cannot use a feature
 * should be told what it is and what unlocks it, not left wondering whether the
 * app is broken.
 */
export function UpgradePrompt({
  feature,
  requiredTier,
  description,
}: {
  /** Human-readable feature name, e.g. "Flashcards". */
  feature: string;
  requiredTier: SubscriptionTier;
  description?: string;
}) {
  const plan = TIER_DISPLAY_NAMES[requiredTier];

  return (
    <div className="card flex flex-col items-center p-8 text-center sm:p-10">
      <span
        className="flex h-11 w-11 items-center justify-center rounded-full bg-primary-soft text-primary"
        aria-hidden
      >
        <LuLock className="h-5 w-5" />
      </span>

      <h2 className="mt-4 text-lg font-bold tracking-tight text-foreground">
        {feature} is part of {plan}
      </h2>

      {description && (
        <p className="mt-2 max-w-md text-sm leading-relaxed text-muted">
          {description}
        </p>
      )}

      <Link href="/settings/billing" className={buttonClass("primary", "md", "mt-6")}>
        Upgrade to {plan}
      </Link>
    </div>
  );
}
