// Which push UI a browser should see. Pure: the browser snapshot is gathered
// in src/lib/push-client.ts and passed in, so every state is testable.

export type PushPermission = "default" | "granted" | "denied";

export type PushEnvSnapshot = {
  /** NEXT_PUBLIC_VAPID_PUBLIC_KEY is set. */
  configured: boolean;
  hasServiceWorker: boolean;
  hasPushManager: boolean;
  hasNotification: boolean;
  permission: PushPermission;
  isIOS: boolean;
  /** Running as an installed app (display-mode: standalone). */
  isStandalone: boolean;
  hasSubscription: boolean;
};

export type PushCapability =
  | "unsupported"
  | "ios-needs-install"
  | "denied"
  | "default"
  | "subscribed";

export function pushCapability(s: PushEnvSnapshot): PushCapability {
  if (!s.configured) return "unsupported";
  // Checked before the API checks: iOS Safari tabs have no PushManager at
  // all, and "install the app" is the one useful thing to tell them.
  if (s.isIOS && !s.isStandalone) return "ios-needs-install";
  if (!s.hasServiceWorker || !s.hasPushManager || !s.hasNotification) return "unsupported";
  if (s.permission === "denied") return "denied";
  if (s.permission === "granted" && s.hasSubscription) return "subscribed";
  return "default";
}

/** iPadOS 13+ reports itself as a Mac; touch points give it away. */
export function detectIOS(ua: { userAgent: string; maxTouchPoints: number }): boolean {
  if (/iPad|iPhone|iPod/.test(ua.userAgent)) return true;
  return /Macintosh/.test(ua.userAgent) && ua.maxTouchPoints > 1;
}

/** Must match SHELL_VERSION in public/sw.js. */
export const REQUIRED_WORKER_VERSION = "v2";

export function isPushWorkerVersion(version: string | null): boolean {
  return version === REQUIRED_WORKER_VERSION;
}

export const OPT_IN_SNOOZE_MS = 14 * 24 * 60 * 60 * 1000;

export function isOptInSnoozed(snoozedAt: number | null, now: number): boolean {
  if (snoozedAt === null || !Number.isFinite(snoozedAt)) return false;
  return now - snoozedAt < OPT_IN_SNOOZE_MS;
}
