/**
 * Reading the caller's tier and enforcing the entitlement matrix.
 *
 * The matrix itself lives in `@/lib/subscription`, which stays database-free
 * and unit-tested. This module is the IO half: it works out who is asking and
 * turns a denial into an HTTP response.
 */

import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { db } from "@/lib/db";
import {
  can,
  isSubscriptionTier,
  requiredTierFor,
  TIER_DISPLAY_NAMES,
  type GatedFeature,
  type SubscriptionTier,
} from "@/lib/subscription";

/**
 * Anyone whose tier cannot be determined is FREEMIUM. Failing closed is the
 * only safe default for a paywall: a missing claim must never read as "grant
 * everything".
 */
export function tierOf(value: unknown): SubscriptionTier {
  return isSubscriptionTier(value as string)
    ? (value as SubscriptionTier)
    : "FREEMIUM";
}

/** The tier carried on a session object, for callers that already have one. */
export function tierOfSession(
  session: { user?: unknown } | null | undefined,
): SubscriptionTier {
  return tierOf((session?.user as { tier?: unknown } | undefined)?.tier);
}

/** The tier straight off the JWT, skipping the `auth()` session round-trip. */
export async function requestTier(
  req: Request,
): Promise<SubscriptionTier | null> {
  const token = await getToken({ req, secret: process.env.AUTH_SECRET });
  if (!token?.sub) return null;
  const profile = (token as { profile?: { tier?: unknown } }).profile;
  return tierOf(profile?.tier);
}

/**
 * Whether this user may use a feature.
 *
 * The session tier is a cache that can lag the database by up to
 * PROFILE_TTL_MS, so a buyer who just paid still carries their old tier. Rather
 * than make them wait out the TTL — or wire a SessionProvider into a layout
 * that deliberately has none — a denial is re-checked against the authoritative
 * `User.tier` column, which `applyChargeSuccess` writes before redirecting.
 *
 * The extra read only happens on the path that was about to say no, so the
 * common case stays free. A stale tier that is too *generous* is left alone:
 * the jwt callback corrects it within the TTL, and briefly over-granting to a
 * lapsed account is the safe direction to be wrong in.
 */
export async function isEntitled(
  userId: string,
  cachedTier: SubscriptionTier,
  feature: GatedFeature,
): Promise<boolean> {
  if (can(cachedTier, feature)) return true;

  try {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { tier: true },
    });
    return can(tierOf(user?.tier), feature);
  } catch {
    // A database blip must not hand out paid features.
    return false;
  }
}

/**
 * 403 rather than 402: the request is understood and the account is real, it
 * simply is not entitled. The body carries what the client needs to prompt an
 * upgrade without hardcoding the matrix on the client.
 */
export function entitlementDenial(feature: GatedFeature): NextResponse {
  const required = requiredTierFor(feature);
  return NextResponse.json(
    {
      error: `This feature is part of ${TIER_DISPLAY_NAMES[required]}.`,
      requiredTier: required,
      feature,
    },
    { status: 403 },
  );
}

/**
 * The gate for route handlers holding a session. Returns a response to send
 * back, or null when the caller is entitled and the handler should carry on.
 *
 *   const denied = await denyUnlessEntitled(session, "flashcards");
 *   if (denied) return denied;
 */
export async function denyUnlessEntitled(
  session: { user?: unknown } | null | undefined,
  feature: GatedFeature,
): Promise<NextResponse | null> {
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return (await isEntitled(userId, tierOfSession(session), feature))
    ? null
    : entitlementDenial(feature);
}
