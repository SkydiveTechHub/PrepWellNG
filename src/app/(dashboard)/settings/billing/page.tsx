import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isBillingEnabled } from "@/lib/billing/paystack";
import { currentEntitlement } from "@/lib/billing/subscription-data";
import { TIER_DISPLAY_NAMES } from "@/lib/subscription";
import { PlanPicker } from "@/components/billing/plan-picker";
import { StatusBanner } from "@/components/admin/status-banner";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = {
  title: "Billing — PrepWell NG",
};

// The page must reflect a charge that landed seconds ago, so it can never be
// served from a cache.
export const dynamic = "force-dynamic";

/** The outcomes `/api/billing/callback` can redirect back with. */
const NOTICES: Record<
  string,
  { tone: "success" | "error" | "info"; title: string }
> = {
  success: { tone: "success", title: "Payment received — your plan is active." },
  failed: {
    tone: "error",
    title: "That payment did not go through. Nothing was charged.",
  },
  // `pending` is deliberately absent: PlanPicker owns that state, because it
  // also has to close the buy buttons and poll until the webhook settles.
  missing: { tone: "error", title: "We could not identify that payment." },
};

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/login");

  const { status } = await searchParams;
  const notice = status ? NOTICES[status] : undefined;
  const { tier, expiresAt } = await currentEntitlement(userId);

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Billing"
        description="Choose the plan that fits how you study."
      />

      <div className="max-w-2xl space-y-5">
        {notice && <StatusBanner tone={notice.tone} title={notice.title} />}

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

        <PlanPicker
          enabled={isBillingEnabled()}
          currentTier={tier}
          awaitingSettlement={status === "pending"}
        />

        <Link
          href="/settings"
          className="inline-block text-sm font-semibold text-muted hover:text-foreground"
        >
          ← Back to settings
        </Link>
      </div>
    </div>
  );
}
