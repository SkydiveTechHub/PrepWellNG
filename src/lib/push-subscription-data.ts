import { db } from "@/lib/db";
import type {
  NotificationPreferences,
  PushSubscriptionInput,
} from "@/lib/push-validators";

const DEFAULT_PREFERENCES: NotificationPreferences = {
  studyReminders: true,
  streakReminders: true,
  announcements: true,
};

/**
 * Upsert by endpoint. An endpoint that belonged to another student moves to
 * this one: on a shared family phone, whoever signed in last owns the device.
 */
export async function saveSubscription(
  userId: string,
  sub: PushSubscriptionInput,
  userAgent: string | null,
): Promise<void> {
  const data = {
    userId,
    p256dh: sub.keys.p256dh,
    auth: sub.keys.auth,
    userAgent: userAgent?.slice(0, 300) ?? null,
    failureCount: 0,
  };
  await db.pushSubscription.upsert({
    where: { endpoint: sub.endpoint },
    create: { endpoint: sub.endpoint, ...data },
    update: data,
  });
}

/** Scoped to the caller: one student cannot remove another's device. */
export async function deleteSubscription(userId: string, endpoint: string): Promise<void> {
  await db.pushSubscription.deleteMany({ where: { userId, endpoint } });
}

export async function deleteAllSubscriptions(userId: string): Promise<void> {
  await db.pushSubscription.deleteMany({ where: { userId } });
}

export async function countSubscriptions(userId: string): Promise<number> {
  return db.pushSubscription.count({ where: { userId } });
}

export async function getPreferences(userId: string): Promise<NotificationPreferences> {
  const row = await db.notificationPreference.findUnique({
    where: { userId },
    select: { studyReminders: true, streakReminders: true, announcements: true },
  });
  return row ?? DEFAULT_PREFERENCES;
}

export async function updatePreferences(
  userId: string,
  patch: Partial<NotificationPreferences>,
): Promise<NotificationPreferences> {
  return db.notificationPreference.upsert({
    where: { userId },
    create: { userId, ...DEFAULT_PREFERENCES, ...patch },
    update: patch,
    select: { studyReminders: true, streakReminders: true, announcements: true },
  });
}
