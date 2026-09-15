import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { audienceWhereSql } from "@/lib/push-audience-sql";
import type { AudienceFilter } from "@/lib/push-audience";
import { expiresAtFrom, type AnnouncementInput } from "@/lib/announcement";
import { buildPushPayload, pushTag } from "@/lib/push-payload";
import { mapWithConcurrency, subscriptionEffect } from "@/lib/push-send-result";
import { SUBSCRIPTION_SELECT, applySubscriptionEffect, sendPush } from "@/lib/push-send";

export async function previewAudience(
  filter: AudienceFilter,
): Promise<{ students: number; subscribedStudents: number; devices: number }> {
  const where = audienceWhereSql(filter);
  const [row] = await db.$queryRaw<{ students: number; subscribed: number; devices: number }[]>`
    SELECT
      count(*)::int AS students,
      count(*) FILTER (WHERE s.n > 0)::int AS subscribed,
      coalesce(sum(s.n), 0)::int AS devices
    FROM "User" u
    LEFT JOIN "NotificationPreference" p ON p."userId" = u."id"
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS n FROM "PushSubscription" ps
      WHERE ps."userId" = u."id" AND (p."userId" IS NULL OR p."announcements")
    ) s ON true
    WHERE ${where}`;
  return { students: row.students, subscribedStudents: row.subscribed, devices: row.devices };
}

/**
 * Creates the announcement and its delivery rows in one transaction. The
 * deliveries are one INSERT … SELECT, so recipients never load into Node.
 */
export async function queueAnnouncement(
  input: AnnouncementInput,
  adminId: string,
  now: Date = new Date(),
): Promise<{ id: string; recipientCount: number }> {
  const where = audienceWhereSql(input.audience);
  return db.$transaction(async (tx) => {
    const announcement = await tx.announcement.create({
      data: {
        title: input.title,
        body: input.body,
        url: input.url,
        audience: input.audience as Prisma.InputJsonValue,
        expiresAt: expiresAtFrom(now, input.expiresInDays),
        createdById: adminId,
      },
      select: { id: true },
    });

    const recipientCount = await tx.$executeRaw`
      INSERT INTO "AnnouncementDelivery" ("id", "announcementId", "subscriptionId", "status", "attempts")
      SELECT gen_random_uuid()::text, ${announcement.id}, s."id", 'PENDING', 0
      FROM "PushSubscription" s
      JOIN "User" u ON u."id" = s."userId"
      LEFT JOIN "NotificationPreference" p ON p."userId" = u."id"
      WHERE ${where} AND (p."userId" IS NULL OR p."announcements")`;

    // Nothing to send: done immediately, but the banner still shows.
    await tx.announcement.update({
      where: { id: announcement.id },
      data:
        recipientCount === 0
          ? { recipientCount, status: "SENT", completedAt: now }
          : { recipientCount },
    });
    return { id: announcement.id, recipientCount };
  });
}

export async function cancelAnnouncement(id: string): Promise<boolean> {
  return db.$transaction(async (tx) => {
    const updated = await tx.announcement.updateMany({
      where: { id, status: { in: ["QUEUED", "SENDING"] } },
      data: { status: "CANCELLED", completedAt: new Date() },
    });
    if (updated.count === 0) return false;
    await tx.announcementDelivery.updateMany({
      where: { announcementId: id, status: "PENDING" },
      data: { status: "CANCELLED" },
    });
    const counts = await tx.announcementDelivery.groupBy({
      by: ["status"],
      where: { announcementId: id },
      _count: { _all: true },
    });
    const count = (s: string) => counts.find((c) => c.status === s)?._count._all ?? 0;
    await tx.announcement.update({
      where: { id },
      data: { sentCount: count("SENT"), failedCount: count("FAILED") + count("GONE") },
    });
    return true;
  });
}

export type AnnouncementRow = {
  id: string;
  title: string;
  body: string;
  url: string | null;
  audience: unknown;
  status: "QUEUED" | "SENDING" | "SENT" | "CANCELLED";
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  pendingCount: number;
  createdAt: string;
  /** Formatted on the server: formatting in the client renders differently during SSR and hydration. */
  createdAtLabel: string;
  expiresAt: string;
  createdBy: string;
};

const LAGOS_DATE_TIME = new Intl.DateTimeFormat("en-NG", {
  timeZone: "Africa/Lagos",
  dateStyle: "medium",
  timeStyle: "short",
});

export async function listAnnouncements(): Promise<AnnouncementRow[]> {
  const rows = await db.announcement.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      createdBy: { select: { email: true, username: true } },
      _count: { select: { deliveries: { where: { status: "PENDING" } } } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    body: r.body,
    url: r.url,
    audience: r.audience,
    status: r.status,
    recipientCount: r.recipientCount,
    sentCount: r.sentCount,
    failedCount: r.failedCount,
    pendingCount: r._count.deliveries,
    createdAt: r.createdAt.toISOString(),
    createdAtLabel: LAGOS_DATE_TIME.format(r.createdAt),
    expiresAt: r.expiresAt.toISOString(),
    createdBy: r.createdBy.username ?? r.createdBy.email ?? "admin",
  }));
}

export async function findStudentByContact(
  contact: string,
): Promise<{ id: string; firstName: string; lastName: string } | null> {
  const value = contact.trim();
  if (!value) return null;
  return db.user.findFirst({
    where: {
      role: "STUDENT",
      OR: value.includes("@") ? [{ email: value.toLowerCase() }] : [{ phone: value }],
    },
    select: { id: true, firstName: true, lastName: true },
  });
}

/** Immediate, not queued, no Announcement row. Ignores the announcements toggle on purpose. */
export async function sendTestPush(
  userId: string,
  message: { title: string; body: string; url: string | null },
): Promise<{ devices: number; sent: number }> {
  const subscriptions = await db.pushSubscription.findMany({
    where: { userId },
    select: SUBSCRIPTION_SELECT,
  });
  const payload = buildPushPayload({ ...message, tag: pushTag.announcement(`test-${Date.now()}`) });
  const outcomes = await mapWithConcurrency(subscriptions, 5, async (sub) => {
    const outcome = await sendPush(sub, payload);
    await applySubscriptionEffect(sub.id, subscriptionEffect(outcome, sub.failureCount, false));
    return outcome;
  });
  return { devices: subscriptions.length, sent: outcomes.filter((o) => o === "sent").length };
}
