import { db } from "@/lib/db";
import { buildPushPayload, pushTag } from "@/lib/push-payload";
import {
  mapWithConcurrency,
  nextDelivery,
  subscriptionEffect,
} from "@/lib/push-send-result";
import {
  SUBSCRIPTION_SELECT,
  applySubscriptionEffect,
  sendPush,
  type StoredSubscription,
} from "@/lib/push-send";

const CLAIM_BATCH = 100;
const SEND_CONCURRENCY = 20;

type ClaimedRow = {
  id: string;
  announcementId: string;
  subscriptionId: string;
  attempts: number;
  title: string;
  body: string;
  url: string | null;
};

type DrainResult = { claimed: number; sent: number; failed: number; gone: number; retrying: number };

/**
 * Claims up to 100 pending deliveries. SKIP LOCKED means two overlapping
 * calls (cron + the admin route's after()) never claim the same row. A claim
 * older than 5 minutes belonged to a call that died, or is a retry waiting
 * its turn, and may be claimed again.
 */
async function claimBatch(): Promise<ClaimedRow[]> {
  return db.$queryRaw<ClaimedRow[]>`
    WITH picked AS (
      SELECT d."id"
      FROM "AnnouncementDelivery" d
      JOIN "Announcement" a ON a."id" = d."announcementId"
      WHERE d."status" = 'PENDING'
        AND a."status" IN ('QUEUED', 'SENDING')
        AND (d."claimedAt" IS NULL OR d."claimedAt" < now() - interval '5 minutes')
      ORDER BY d."id"
      LIMIT ${CLAIM_BATCH}
      FOR UPDATE OF d SKIP LOCKED
    )
    UPDATE "AnnouncementDelivery" d
    SET "claimedAt" = now()
    FROM picked, "Announcement" a
    WHERE d."id" = picked."id" AND a."id" = d."announcementId"
    RETURNING d."id", d."announcementId", d."subscriptionId", d."attempts", a."title", a."body", a."url"`;
}

async function finalizeOne(id: string): Promise<void> {
  const pending = await db.announcementDelivery.count({
    where: { announcementId: id, status: "PENDING" },
  });
  if (pending > 0) return;
  const counts = await db.announcementDelivery.groupBy({
    by: ["status"],
    where: { announcementId: id },
    _count: { _all: true },
  });
  const count = (s: string) => counts.find((c) => c.status === s)?._count._all ?? 0;
  // Guarded on status so a cancel that raced this call keeps CANCELLED.
  await db.announcement.updateMany({
    where: { id, status: { in: ["QUEUED", "SENDING"] } },
    data: {
      status: "SENT",
      completedAt: new Date(),
      sentCount: count("SENT"),
      failedCount: count("FAILED") + count("GONE"),
    },
  });
}

/**
 * Finalizes every announcement this call touched, plus a sweep for any
 * announcement left stuck in SENDING with no PENDING deliveries (e.g. an
 * earlier call settled its last rows but was killed, or threw, before
 * finalizing). The sweep runs even when this call claimed nothing, so an
 * otherwise-empty drain still repairs stuck announcements.
 */
async function finalize(announcementIds: string[]): Promise<void> {
  const ids = new Set(announcementIds);

  const stuck = await db.announcement.findMany({
    where: { status: "SENDING", deliveries: { none: { status: "PENDING" } } },
    select: { id: true },
    take: 50,
  });
  stuck.forEach((a) => ids.add(a.id));

  for (const id of ids) {
    await finalizeOne(id);
  }
}

export async function drainAnnouncements(options: { deadline: number }): Promise<DrainResult> {
  const result: DrainResult = { claimed: 0, sent: 0, failed: 0, gone: 0, retrying: 0 };
  const touched = new Set<string>();

  while (Date.now() < options.deadline) {
    let batch: ClaimedRow[];
    let byId: Map<string, StoredSubscription>;
    try {
      batch = await claimBatch();
      if (batch.length === 0) break;
      result.claimed += batch.length;

      const announcementIds = [...new Set(batch.map((row) => row.announcementId))];
      announcementIds.forEach((id) => touched.add(id));
      await db.announcement.updateMany({
        where: { id: { in: announcementIds }, status: "QUEUED" },
        data: { status: "SENDING" },
      });

      const subscriptions = await db.pushSubscription.findMany({
        where: { id: { in: batch.map((row) => row.subscriptionId) } },
        select: SUBSCRIPTION_SELECT,
      });
      byId = new Map(subscriptions.map((s) => [s.id, s]));
    } catch (error) {
      // End this call but still finalize what it touched. Claimed rows stay
      // PENDING and are re-claimed after the 5-minute stale window.
      console.error("drain: could not claim a batch", error);
      break;
    }

    await mapWithConcurrency(batch, SEND_CONCURRENCY, async (row) => {
      // Past the budget: leave the row PENDING with its claimedAt intact.
      // A later call re-claims it once the 5-minute stale window passes.
      if (Date.now() >= options.deadline) return;

      const sub = byId.get(row.subscriptionId);
      if (!sub) {
        // Deleted since queueing (sign-out, 410 from another send). Only
        // count/apply this if the row was still PENDING — a cancel may have
        // moved it to CANCELLED while we were working.
        try {
          const updated = await db.announcementDelivery.updateMany({
            where: { id: row.id, status: "PENDING" },
            data: { status: "GONE", attempts: row.attempts + 1, error: "subscription removed" },
          });
          if (updated.count === 1) result.gone += 1;
        } catch (error) {
          console.error("drain: could not record delivery", row.id, error);
        }
        return;
      }

      const payload = buildPushPayload({
        title: row.title,
        body: row.body,
        url: row.url,
        tag: pushTag.announcement(row.announcementId),
      });
      const outcome = await sendPush(sub, payload);
      const next = nextDelivery(outcome, row.attempts);

      // One transient DB error must not reject the whole batch (that would
      // skip finalize and re-send every row of it 5 minutes later).
      try {
        // A retry keeps its claimedAt, so it waits out the 5-minute stale
        // window instead of burning all three attempts within seconds. Guard
        // on PENDING so a cancel that raced this send doesn't get overwritten
        // by a SENT/FAILED/GONE/PENDING write.
        const updated = await db.announcementDelivery.updateMany({
          where: { id: row.id, status: "PENDING" },
          data: {
            status: next.status,
            attempts: next.attempts,
            error: outcome === "sent" ? null : outcome,
          },
        });

        // The push service's answer about the subscription is still true even
        // if the delivery row itself was cancelled underneath us.
        await applySubscriptionEffect(
          sub.id,
          subscriptionEffect(outcome, sub.failureCount, next.status === "FAILED"),
        );

        if (updated.count !== 1) return;
        if (next.status === "SENT") result.sent += 1;
        else if (next.status === "GONE") result.gone += 1;
        else if (next.status === "FAILED") result.failed += 1;
        else result.retrying += 1;
      } catch (error) {
        console.error("drain: could not record delivery", row.id, error);
      }
    });
  }

  await finalize([...touched]);
  return result;
}
