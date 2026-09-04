/**
 * Every Prisma read and write billing performs.
 *
 * The rules themselves live in the pure modules alongside this one; this file
 * only moves rows. Keeping the split honest is what lets term stacking,
 * expiry, and settlement be tested without a database.
 */

import { db } from "@/lib/db";
import {
  planFor,
  type BillingPeriod,
  type SubscriptionTier,
} from "@/lib/subscription";
import { resolveTier, type Entitlement } from "@/lib/billing/entitlement";
import { termEnd, termStart } from "@/lib/billing/term";
import { settle, type VerifiedTransaction } from "@/lib/billing/settlement";
import { newReference } from "@/lib/billing/reference";

const ENTITLEMENT_SELECT = {
  tier: true,
  status: true,
  startsAt: true,
  endsAt: true,
} as const;

export async function activeRowsFor(userId: string) {
  return db.subscription.findMany({
    where: { userId, status: "ACTIVE" },
    select: ENTITLEMENT_SELECT,
  });
}

export async function currentEntitlement(
  userId: string,
  now: Date = new Date(),
): Promise<Entitlement> {
  return resolveTier(await activeRowsFor(userId), now);
}

/**
 * Writes the derived tier back onto the User cache column. Returns what it
 * settled on, so callers can avoid a second read.
 */
export async function refreshCachedTier(
  userId: string,
  now: Date = new Date(),
): Promise<SubscriptionTier> {
  const { tier } = await currentEntitlement(userId, now);

  await db.user.updateMany({
    where: { id: userId, tier: { not: tier } },
    data: { tier, tierUpdatedAt: now },
  });

  return tier;
}

export async function latestSubscriptionFor(userId: string) {
  return db.subscription.findFirst({
    where: { userId, status: "ACTIVE" },
    orderBy: { endsAt: "desc" },
  });
}

export async function createPendingSubscription({
  userId,
  tier,
  period,
}: {
  userId: string;
  tier: SubscriptionTier;
  period: BillingPeriod;
}): Promise<{ reference: string; amountKobo: number }> {
  const plan = planFor(tier, period);
  const reference = newReference();

  // Stale PENDING rows from abandoned checkouts would otherwise pile up on the
  // account forever. They grant nothing either way — resolveTier ignores
  // anything that is not ACTIVE — but they make the billing history unreadable.
  await db.subscription.updateMany({
    where: { userId, status: "PENDING" },
    data: { status: "ABANDONED" },
  });

  await db.subscription.create({
    data: {
      userId,
      tier,
      period,
      source: "PAYSTACK",
      status: "PENDING",
      reference,
      amountKobo: plan.amountKobo,
      currency: "NGN",
    },
  });

  return { reference, amountKobo: plan.amountKobo };
}

export type ChargeOutcome =
  | "activated"
  | "already-applied"
  | "rejected"
  | "unknown-reference";

/**
 * The single place a payment becomes access.
 *
 * Both the browser callback and the signed webhook call this, so it must be
 * safe to run twice on one reference — `settle` returns "already-applied" for
 * the second caller, and the term is never extended twice.
 */
export async function applyChargeSuccess(
  transaction: VerifiedTransaction,
  now: Date = new Date(),
): Promise<ChargeOutcome> {
  const pending = await db.subscription.findUnique({
    where: { reference: transaction.reference },
  });

  if (!pending) return "unknown-reference";

  const decision = settle(
    {
      reference: pending.reference,
      tier: pending.tier as SubscriptionTier,
      period: pending.period as BillingPeriod,
      amountKobo: pending.amountKobo,
      currency: pending.currency,
      status: pending.status,
    },
    transaction,
    now,
  );

  if (decision.kind === "already-applied") return "already-applied";

  if (decision.kind === "reject") {
    if (decision.reason === "not-successful") {
      await db.subscription.update({
        where: { id: pending.id },
        data: { status: "FAILED" },
      });
    }
    return "rejected";
  }

  const live = await latestSubscriptionFor(pending.userId);
  const startsAt = termStart(now, live?.endsAt ?? null);
  const endsAt = termEnd(startsAt, pending.period as BillingPeriod);

  await db.$transaction([
    // Guarded on status so two concurrent callers cannot both activate: the
    // loser updates zero rows.
    db.subscription.updateMany({
      where: { id: pending.id, status: "PENDING" },
      data: {
        status: "ACTIVE",
        paidAt: decision.paidAt,
        channel: decision.channel,
        startsAt,
        endsAt,
      },
    }),
    db.user.update({
      where: { id: pending.userId },
      data: { tier: pending.tier, tierUpdatedAt: now },
    }),
  ]);

  // The user column is set optimistically above; re-derive in case a richer
  // comp is also live, so the cache never demotes someone mid-term.
  await refreshCachedTier(pending.userId, now);

  return "activated";
}

/**
 * Records a Paystack delivery. Returns false when this event was already
 * recorded, which is the idempotency gate: the caller stops there.
 */
export async function recordPaystackEvent({
  reference,
  type,
  payload,
}: {
  reference: string;
  type: string;
  payload: unknown;
}): Promise<boolean> {
  try {
    await db.paystackEvent.create({
      data: {
        eventKey: `${reference}:${type}`,
        type,
        payload: payload as object,
      },
    });
    return true;
  } catch {
    // A primary-key collision means Paystack redelivered an event we have
    // already handled. Anything else that throws here would also be safest
    // treated as "do not apply twice".
    return false;
  }
}

export async function grantComp({
  userId,
  tier,
  period,
  grantedById,
  note,
  now = new Date(),
}: {
  userId: string;
  tier: SubscriptionTier;
  period: BillingPeriod;
  grantedById: string;
  note?: string | null;
  now?: Date;
}): Promise<void> {
  const live = await latestSubscriptionFor(userId);
  const startsAt = termStart(now, live?.endsAt ?? null);

  await db.subscription.create({
    data: {
      userId,
      tier,
      period,
      source: "COMP",
      status: "ACTIVE",
      reference: newReference(),
      amountKobo: 0,
      currency: "NGN",
      paidAt: now,
      startsAt,
      endsAt: termEnd(startsAt, period),
      grantedById,
      note: note ?? null,
    },
  });

  await refreshCachedTier(userId, now);
}

/**
 * Ends every live subscription immediately — including paid ones. This is what
 * an admin setting a student back to Freemium means, and the UI says so before
 * asking for confirmation. Refunds stay a manual Paystack dashboard action.
 */
export async function revokeSubscriptions(
  userId: string,
  now: Date = new Date(),
): Promise<void> {
  await db.subscription.updateMany({
    where: { userId, status: "ACTIVE" },
    data: { status: "REVOKED", endsAt: now },
  });

  await refreshCachedTier(userId, now);
}
