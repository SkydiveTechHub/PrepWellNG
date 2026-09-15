import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { lagosDayKey, previousDayKey } from "@/lib/streak";
import { buildPushPayload, pushTag } from "@/lib/push-payload";
import { mapWithConcurrency, subscriptionEffect } from "@/lib/push-send-result";
import { SUBSCRIPTION_SELECT, applySubscriptionEffect, sendPush } from "@/lib/push-send";
import {
  REMINDER_PAGE_SIZE,
  buildMorningDigest,
  buildStreakReminder,
  lagosDayEnd,
  lagosDayStart,
  planDateFor,
  streakToRemind,
  type DigestPlanItem,
  type ReminderKind,
  type ReminderMessage,
} from "@/lib/push-reminders";

const SEND_CONCURRENCY = 20;
const STREAK_LOOKBACK_DAYS = 400;
const DAY_MS = 24 * 60 * 60 * 1000;
/** A page claims up to REMINDER_PAGE_SIZE students; never start one without this much budget left. */
const PAGE_START_RESERVE_MS = 15_000;

/** skipped: claimed sends not attempted because the deadline passed (missed today, never duplicated). */
type RunResult = { processed: number; notified: number; sent: number; skipped: number; done: boolean };

/** Students who could get this reminder and have not been processed today. */
async function findCandidates(kind: ReminderKind, dayKey: string): Promise<string[]> {
  const preference: Prisma.UserWhereInput =
    kind === "morning"
      ? { OR: [{ notificationPreference: null }, { notificationPreference: { studyReminders: true } }] }
      : { OR: [{ notificationPreference: null }, { notificationPreference: { streakReminders: true } }] };

  const narrowing: Prisma.UserWhereInput =
    kind === "streak"
      ? {
          // Only students who practised yesterday can have a streak at risk.
          attempts: {
            some: {
              status: "COMPLETED",
              completedAt: {
                gte: lagosDayStart(previousDayKey(dayKey)),
                lt: lagosDayStart(dayKey),
              },
            },
          },
        }
      : {};

  const rows = await db.user.findMany({
    where: {
      role: "STUDENT",
      isActive: true,
      pushSubscriptions: { some: {} },
      reminderLogs: { none: { kind, dayKey } },
      AND: [preference, narrowing],
    },
    select: { id: true },
    orderBy: { id: "asc" },
    take: REMINDER_PAGE_SIZE,
  });
  return rows.map((r) => r.id);
}

/**
 * Claims the page: only users whose log row THIS call inserted are returned,
 * so an overlapping or retried call can never notify the same student twice.
 */
async function claim(kind: ReminderKind, dayKey: string, userIds: string[]): Promise<string[]> {
  if (userIds.length === 0) return [];
  const rows = await db.$queryRaw<{ userId: string }[]>`
    INSERT INTO "ReminderLog" ("userId", "kind", "dayKey", "sentAt")
    SELECT u, ${kind}, ${dayKey}, now() FROM unnest(${userIds}::text[]) AS u
    ON CONFLICT DO NOTHING
    RETURNING "userId"`;
  return rows.map((r) => r.userId);
}

async function morningMessages(userIds: string[], dayKey: string): Promise<Map<string, ReminderMessage>> {
  const [items, due] = await Promise.all([
    db.studyPlanItem.findMany({
      where: {
        status: "PENDING",
        scheduledDate: planDateFor(dayKey),
        studyPlan: { isActive: true, studentId: { in: userIds } },
      },
      select: {
        durationMinutes: true,
        topic: { select: { title: true } },
        subject: { select: { name: true } },
        studyPlan: { select: { studentId: true } },
      },
      orderBy: { id: "asc" },
    }),
    db.flashcardReview.groupBy({
      by: ["studentId"],
      where: { studentId: { in: userIds }, dueAt: { lt: lagosDayEnd(dayKey) } },
      _count: { _all: true },
    }),
  ]);

  const planByUser = new Map<string, DigestPlanItem[]>();
  for (const row of items) {
    const list = planByUser.get(row.studyPlan.studentId) ?? [];
    list.push({
      topicName: row.topic?.title ?? null,
      subjectName: row.subject.name,
      durationMinutes: row.durationMinutes,
    });
    planByUser.set(row.studyPlan.studentId, list);
  }
  const dueByUser = new Map(due.map((d) => [d.studentId, d._count._all]));

  const messages = new Map<string, ReminderMessage>();
  for (const userId of userIds) {
    const message = buildMorningDigest({
      planItems: planByUser.get(userId) ?? [],
      dueCards: dueByUser.get(userId) ?? 0,
    });
    if (message) messages.set(userId, message);
  }
  return messages;
}

async function streakMessages(userIds: string[], dayKey: string, now: Date): Promise<Map<string, ReminderMessage>> {
  const attempts = await db.assessmentAttempt.findMany({
    where: {
      studentId: { in: userIds },
      status: "COMPLETED",
      completedAt: { gte: new Date(now.getTime() - STREAK_LOOKBACK_DAYS * DAY_MS) },
    },
    select: { studentId: true, completedAt: true },
  });

  const daysByUser = new Map<string, Set<string>>();
  for (const a of attempts) {
    if (!a.completedAt) continue;
    const set = daysByUser.get(a.studentId) ?? new Set<string>();
    set.add(lagosDayKey(a.completedAt));
    daysByUser.set(a.studentId, set);
  }

  const messages = new Map<string, ReminderMessage>();
  for (const userId of userIds) {
    const streak = streakToRemind(daysByUser.get(userId) ?? [], dayKey);
    if (streak !== null) messages.set(userId, buildStreakReminder(streak));
  }
  return messages;
}

export async function runReminders(
  kind: ReminderKind,
  options: { now: Date; deadline: number },
): Promise<RunResult> {
  const dayKey = lagosDayKey(options.now);
  const result: RunResult = { processed: 0, notified: 0, sent: 0, skipped: 0, done: false };

  while (Date.now() < options.deadline - PAGE_START_RESERVE_MS) {
    const candidates = await findCandidates(kind, dayKey);
    if (candidates.length === 0) {
      result.done = true;
      break;
    }

    const claimed = await claim(kind, dayKey, candidates);
    result.processed += claimed.length;
    if (claimed.length === 0) continue; // another call took this page

    const messages =
      kind === "morning"
        ? await morningMessages(claimed, dayKey)
        : await streakMessages(claimed, dayKey, options.now);
    if (messages.size === 0) continue;
    result.notified += messages.size;

    const subscriptions = await db.pushSubscription.findMany({
      where: { userId: { in: [...messages.keys()] } },
      select: { ...SUBSCRIPTION_SELECT, userId: true },
    });

    const outcomes = await mapWithConcurrency(subscriptions, SEND_CONCURRENCY, async (sub) => {
      // Claimed but out of time: a missed reminder beats a duplicate one.
      if (Date.now() >= options.deadline) return "skipped" as const;
      const message = messages.get(sub.userId)!;
      const payload = buildPushPayload({
        ...message,
        tag: kind === "morning" ? pushTag.morning(dayKey) : pushTag.streak(dayKey),
      });
      const outcome = await sendPush(sub, payload);
      // Reminders are never retried the same day, so every failure is final.
      await applySubscriptionEffect(sub.id, subscriptionEffect(outcome, sub.failureCount, true));
      return outcome;
    });
    result.sent += outcomes.filter((o) => o === "sent").length;
    result.skipped += outcomes.filter((o) => o === "skipped").length;
  }

  return result;
}
