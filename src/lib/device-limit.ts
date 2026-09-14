/**
 * Device limit rules, as pure functions.
 *
 * A "device" is one sign-in: one UserDevice row, whose id rides on the student
 * JWT as `deviceId`. Paid accounts may hold DEVICE_LIMIT of them at once; a new
 * sign-in past that signs out the least recently used. This is anti-sharing,
 * not security — it only has to make one account used by several students
 * inconvenient, never block a real student.
 *
 * Kept free of database and next-auth imports: proxy.ts imports it on every
 * request, and the tests run without either.
 *
 * See docs/superpowers/specs/2026-09-13-device-limit-design.md
 */

import { hasAtLeast, type SubscriptionTier } from "@/lib/subscription";

export const DEVICE_LIMIT = 2;

/** An active device writes lastSeenAt no more often than this. */
export const LAST_SEEN_WRITE_INTERVAL_MS = 15 * 60_000;

export type DeviceSummary = { id: string; lastSeenAt: Date };

/** Freemium is unlimited: a shared free account costs nothing. */
export function isDeviceLimited(tier: SubscriptionTier): boolean {
  return hasAtLeast({ tier }, "STANDARD");
}

/**
 * Which of a user's active devices to sign out so at most `limit` remain.
 * `keepId` — the device signing in right now — always survives, whatever its
 * timestamp says: instances' clocks can disagree.
 */
export function devicesToRevoke(
  devices: DeviceSummary[],
  keepId: string,
  limit: number,
): string[] {
  const others = devices
    .filter((d) => d.id !== keepId)
    .sort(
      (a, b) =>
        b.lastSeenAt.getTime() - a.lastSeenAt.getTime() ||
        (a.id < b.id ? 1 : a.id > b.id ? -1 : 0),
    );
  return others.slice(Math.max(limit - 1, 0)).map((d) => d.id);
}

// Order matters: Edge and Samsung Internet also say "Chrome", Chrome also says
// "Safari", and iPhone/iPad user agents also say "Mac OS X".
const BROWSERS: [RegExp, string][] = [
  [/Edg\//, "Edge"],
  [/OPR\/|Opera/, "Opera"],
  [/SamsungBrowser\//, "Samsung Internet"],
  [/Firefox\/|FxiOS\//, "Firefox"],
  [/Chrome\/|CriOS\//, "Chrome"],
  [/Safari\//, "Safari"],
];

const PLATFORMS: [RegExp, string][] = [
  [/Android/, "Android"],
  [/iPhone/, "iPhone"],
  [/iPad/, "iPad"],
  [/Windows/, "Windows"],
  [/Mac OS X|Macintosh/, "macOS"],
  [/CrOS/, "ChromeOS"],
  [/Linux/, "Linux"],
];

export function deviceLabel(userAgent: string | null | undefined): string {
  if (!userAgent) return "Unknown device";
  const browser = BROWSERS.find(([re]) => re.test(userAgent))?.[1];
  const platform = PLATFORMS.find(([re]) => re.test(userAgent))?.[1];
  if (browser && platform) return `${browser} on ${platform}`;
  return browser ?? platform ?? "Unknown device";
}

export function shouldTouchLastSeen(lastSeenAt: Date, now: Date): boolean {
  return now.getTime() - lastSeenAt.getTime() > LAST_SEEN_WRITE_INTERVAL_MS;
}

export type DeviceState = "untracked" | "active" | "revoked";

/**
 * A token with no deviceId predates this feature and stays valid until its
 * next sign-in registers it. A deviceId whose row is gone counts as revoked.
 */
export function deviceState(
  deviceId: string | undefined,
  row: { revokedAt: Date | null } | undefined,
): DeviceState {
  if (!deviceId) return "untracked";
  if (!row || row.revokedAt) return "revoked";
  return "active";
}

export type StudentTokenState = "none" | "revoked" | "active";

export function studentTokenState(
  token: Record<string, unknown> | null,
): StudentTokenState {
  if (!token) return "none";
  return token.deviceRevoked === true ? "revoked" : "active";
}

export type RevokedTokenAction = "unauthorized" | "redirect-with-reason" | "continue";

/** What proxy.ts does with a request carrying a `deviceRevoked` token. */
export function revokedTokenAction(args: {
  pathname: string;
  reason: string | null;
  isPublic: boolean;
}): RevokedTokenAction {
  if (args.pathname.startsWith("/api/")) return "unauthorized";
  if (args.pathname === "/login") {
    return args.reason === "device" ? "continue" : "redirect-with-reason";
  }
  if (args.pathname === "/register" || args.isPublic) return "continue";
  return "redirect-with-reason";
}

/**
 * Coarse on purpose: lastSeenAt is only written every 15 minutes, so anything
 * finer would be false precision.
 */
export function formatLastActive(lastSeenAt: Date, now: Date): string {
  const minutes = Math.floor((now.getTime() - lastSeenAt.getTime()) / 60_000);
  if (minutes < 15) return "Active recently";
  if (minutes < 60) return `Last active ${minutes} minutes ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Last active ${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `Last active ${days} day${days === 1 ? "" : "s"} ago`;
}
