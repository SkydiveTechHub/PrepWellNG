/**
 * What a verified Paystack transaction means for the row that authorised it.
 *
 * Both confirmation paths — the browser callback and the signed webhook — pass
 * through here before anything is written, so the rules hold whichever arrives
 * first and whichever arrives twice.
 */

import type {
  BillingPeriod,
  SubscriptionStatus,
  SubscriptionTier,
} from "@/lib/subscription";

export type PendingRow = {
  reference: string;
  tier: SubscriptionTier;
  period: BillingPeriod;
  amountKobo: number;
  currency: string;
  status: SubscriptionStatus;
};

/** The normalised shape of a Paystack transaction, from `verifyTransaction`. */
export type VerifiedTransaction = {
  reference: string;
  status: string;
  amountKobo: number;
  currency: string;
  channel: string | null;
  paidAt: Date | null;
};

export type Settlement =
  | { kind: "activate"; paidAt: Date; channel: string | null }
  | { kind: "already-applied" }
  | {
      kind: "reject";
      reason:
        | "reference-mismatch"
        | "not-successful"
        | "not-pending"
        | "amount-mismatch"
        | "currency-mismatch";
    };

export function settle(
  pending: PendingRow,
  transaction: VerifiedTransaction,
  now: Date,
): Settlement {
  if (pending.reference !== transaction.reference) {
    return { kind: "reject", reason: "reference-mismatch" };
  }

  // Idempotency's first line: the row already carries the grant. A callback and
  // a webhook racing on one reference must produce exactly one activation.
  if (pending.status === "ACTIVE") return { kind: "already-applied" };

  // ABANDONED settles too. It is a statement about our checkout UI — a newer
  // attempt superseded this row — never about the card, and the buyer can
  // still finish paying in the Paystack tab that row opened. Rejecting there
  // would take the money and grant nothing, the one outcome billing must never
  // produce. Nothing is relaxed by allowing it: the reference is server-issued
  // and the amount and currency are still checked below.
  //
  // REVOKED (an admin's decision) and FAILED (Paystack's own verdict) are not
  // bookkeeping artefacts, so they stay final.
  if (pending.status !== "PENDING" && pending.status !== "ABANDONED") {
    return { kind: "reject", reason: "not-pending" };
  }

  if (transaction.status !== "success") {
    return { kind: "reject", reason: "not-successful" };
  }

  // Checked in both directions. A mismatch either way means the charge is not
  // the one we authorised — this is what stops an edited redirect buying
  // PREMIUM for a hundred naira.
  if (transaction.amountKobo !== pending.amountKobo) {
    return { kind: "reject", reason: "amount-mismatch" };
  }

  if (transaction.currency !== pending.currency) {
    return { kind: "reject", reason: "currency-mismatch" };
  }

  return {
    kind: "activate",
    paidAt: transaction.paidAt ?? now,
    channel: transaction.channel,
  };
}
