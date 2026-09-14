import { z } from "zod";

const BASE64URL = /^[A-Za-z0-9_-]+={0,2}$/;

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

export const pushSubscriptionSchema = z.object({
  endpoint: z.string().max(1024).refine(isHttpsUrl, "Endpoint must be an https URL"),
  keys: z.object({
    p256dh: z.string().min(80).max(100).regex(BASE64URL),
    auth: z.string().min(16).max(32).regex(BASE64URL),
  }),
});

export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>;

export const unsubscribeSchema = z.object({
  endpoint: z.string().min(1).max(1024),
});

export const notificationPreferencesSchema = z
  .object({
    studyReminders: z.boolean(),
    streakReminders: z.boolean(),
    announcements: z.boolean(),
  })
  .partial()
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, "Nothing to update");

export type NotificationPreferences = {
  studyReminders: boolean;
  streakReminders: boolean;
  announcements: boolean;
};
