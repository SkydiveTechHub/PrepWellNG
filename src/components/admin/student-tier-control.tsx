"use client";

import { cn } from "@/lib/utils";
import { TIER_LABELS } from "@/lib/subscription";
import type { SubscriptionTier } from "@/lib/subscription";

export function StudentTierControl({
  tier,
  tierUpdatedAt,
  className,
}: {
  studentId: string;
  tier: SubscriptionTier;
  tierUpdatedAt: string | null;
  canEdit: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn("rounded-lg border border-border-strong bg-card p-4", className)}
    >
      <p className="text-sm text-foreground">
        Currently on <strong>{TIER_LABELS[tier]}</strong>
        {tierUpdatedAt ? `, set ${tierUpdatedAt}` : ""}.
      </p>
    </div>
  );
}
