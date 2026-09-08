"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { StatusBanner } from "@/components/admin/status-banner";
import {
  BILLING_PERIODS,
  PERIOD_LABELS,
  TIER_DISPLAY_NAMES,
  formatNaira,
  planFor,
  type BillingPeriod,
  type SubscriptionTier,
} from "@/lib/subscription";

const BUYABLE: SubscriptionTier[] = ["STANDARD", "PREMIUM"];

/** How long to keep re-checking before giving up and telling the buyer to wait. */
const SETTLE_POLL_MS = 3_000;
const SETTLE_TIMEOUT_MS = 60_000;

export function PlanPicker({
  enabled,
  currentTier,
  awaitingSettlement = false,
}: {
  enabled: boolean;
  currentTier: SubscriptionTier;
  /** True on the `?status=pending` return, when a charge is still settling. */
  awaitingSettlement?: boolean;
}) {
  const router = useRouter();
  const [period, setPeriod] = useState<BillingPeriod>("YEARLY");
  const [busy, setBusy] = useState<SubscriptionTier | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gaveUp, setGaveUp] = useState(false);

  // A charge confirmed by the webhook rather than the browser callback lands
  // after this page rendered. Re-running the server component is enough to pick
  // it up — it is `force-dynamic` and reads the entitlement rows directly — so
  // the buyer sees the new plan without touching anything. Without this the
  // page sits on "still confirming" with live buy buttons, which is precisely
  // where someone pays a second time.
  useEffect(() => {
    if (!awaitingSettlement) return;

    const startedAt = Date.now();
    const timer = setInterval(() => {
      if (Date.now() - startedAt >= SETTLE_TIMEOUT_MS) {
        clearInterval(timer);
        setGaveUp(true);
        return;
      }
      router.refresh();
    }, SETTLE_POLL_MS);

    return () => clearInterval(timer);
  }, [awaitingSettlement, router]);

  async function buy(tier: SubscriptionTier) {
    setBusy(tier);
    setError(null);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier, period }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not start the payment");
        setBusy(null);
        return;
      }
      // Paystack hosts the payment page; we never touch card details.
      // `assign` rather than setting `location.href`: the React Compiler lint
      // treats the assignment as mutating a value defined outside the component.
      // The button stays busy through the navigation — clearing it would invite
      // a second click against a transaction already on its way.
      window.location.assign(data.authorizationUrl);
    } catch {
      setError("Could not reach the server");
      setBusy(null);
    }
  }

  if (!enabled) {
    return (
      <StatusBanner
        tone="info"
        title="Payments are not available right now. Please check back shortly."
      />
    );
  }

  // Buying is closed while a charge is in flight. This is the whole point of
  // the pending state: the money may already be gone.
  const settling = awaitingSettlement && !gaveUp;

  return (
    <div>
      {error && <StatusBanner tone="error" title={error} className="mb-4" />}

      {settling && (
        <StatusBanner
          tone="info"
          title="Confirming your payment…"
          message="This page updates by itself once it clears. Please do not pay again."
          className="mb-4"
        />
      )}

      {gaveUp && (
        <StatusBanner
          tone="info"
          title="Your payment is taking longer than usual to confirm."
          message="Nothing is lost — refresh this page in a few minutes. If it still has not cleared, contact support before paying again."
          className="mb-4"
        />
      )}

      <div className="flex gap-2" role="group" aria-label="Billing period">
        {BILLING_PERIODS.map((value) => (
          <Button
            key={value}
            variant={period === value ? "primary" : "outline"}
            aria-pressed={period === value}
            onClick={() => setPeriod(value)}
          >
            {PERIOD_LABELS[value]}
          </Button>
        ))}
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {BUYABLE.map((tier) => {
          const plan = planFor(tier, period);
          const isCurrent = tier === currentTier;

          return (
            <div key={tier} className="card p-5">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-foreground">
                  {TIER_DISPLAY_NAMES[tier]}
                </h3>
                {isCurrent && (
                  <span className="rounded-full bg-success-soft px-2 py-0.5 text-xs font-semibold text-success">
                    Current plan
                  </span>
                )}
              </div>

              <p className="mt-1 text-2xl font-extrabold text-foreground">
                {formatNaira(plan.amountKobo)}
                <span className="ml-1 text-sm font-medium text-muted">
                  /{period === "YEARLY" ? "year" : "month"}
                </span>
              </p>

              <Button
                className="mt-4 w-full"
                variant={isCurrent ? "outline" : "primary"}
                onClick={() => buy(tier)}
                // Never offer the plan they are already on: re-buying it is the
                // easiest way to pay twice by accident.
                disabled={isCurrent || settling || busy !== null}
              >
                {isCurrent
                  ? "Your plan"
                  : busy === tier
                    ? "Starting…"
                    : `Get ${TIER_DISPLAY_NAMES[tier]}`}
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
