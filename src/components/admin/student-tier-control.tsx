"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { StatusBanner } from "@/components/admin/status-banner";
import { SUBSCRIPTION_TIERS, TIER_LABELS, type SubscriptionTier } from "@/lib/subscription";
import { BILLING_PERIODS, PERIOD_LABELS, type BillingPeriod } from "@/lib/subscription";

const INPUT_CLS =
  "px-3 py-2 rounded-lg border border-border bg-card text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60";

export function StudentTierControl({
  studentId,
  tier,
  tierUpdatedAt,
  canEdit,
  className,
}: {
  studentId: string;
  tier: SubscriptionTier;
  tierUpdatedAt: string | null;
  canEdit: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [next, setNext] = useState<SubscriptionTier>(tier);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<BillingPeriod>("MONTHLY");
  const [note, setNote] = useState("");

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/admin/api/students/${studentId}/tier`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier: next, period, note: note || undefined }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Could not change the plan");
        return;
      }
      router.refresh();
    } catch {
      setError("Could not reach the server");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={cn("rounded-lg border border-border-strong bg-card p-4", className)}>
      {error && <StatusBanner tone="error" title={error} className="mb-4" />}

      <p className="text-sm text-foreground">
        Currently on <strong>{TIER_LABELS[tier]}</strong>
        {tierUpdatedAt ? `, set ${tierUpdatedAt}` : ""}.
      </p>

      {canEdit && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label htmlFor="tier" className="sr-only">Plan</label>
          <select
            id="tier"
            value={next}
            onChange={(e) => setNext(e.target.value as SubscriptionTier)}
            className={INPUT_CLS}
          >
            {SUBSCRIPTION_TIERS.map((value) => (
              <option key={value} value={value}>{TIER_LABELS[value]}</option>
            ))}
          </select>
          {next !== "FREEMIUM" && (
            <>
              <label htmlFor="period" className="sr-only">Duration</label>
              <select
                id="period"
                value={period}
                onChange={(e) => setPeriod(e.target.value as BillingPeriod)}
                className={INPUT_CLS}
              >
                {BILLING_PERIODS.map((value) => (
                  <option key={value} value={value}>{PERIOD_LABELS[value]}</option>
                ))}
              </select>
            </>
          )}

          <label htmlFor="tier-note" className="sr-only">Note</label>
          <input
            id="tier-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={280}
            placeholder="Why (optional)"
            className={INPUT_CLS}
          />
          <Button onClick={save} disabled={saving || next === tier}>
            {saving ? "Saving…" : "Change plan"}
          </Button>
          <p className="w-full text-xs text-muted">
            {next === "FREEMIUM"
              ? "This ends every live subscription immediately, including one the student paid for. Refunds are handled in the Paystack dashboard. Recorded in the audit log."
              : "Grants a comped subscription that expires on its own. If the student already has time left, this is added on top. Recorded in the audit log."}
          </p>
        </div>
      )}
    </div>
  );
}
