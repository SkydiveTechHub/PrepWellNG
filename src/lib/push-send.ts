import webpush from "web-push";
import { db } from "@/lib/db";
import { readPushConfig } from "@/lib/push-config";
import type { PushPayload } from "@/lib/push-payload";
import {
  classifySendResult,
  type SendOutcome,
  type SubscriptionEffect,
} from "@/lib/push-send-result";

export type StoredSubscription = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  failureCount: number;
};

export const SUBSCRIPTION_SELECT = {
  id: true,
  endpoint: true,
  p256dh: true,
  auth: true,
  failureCount: true,
} as const;

let configuredWith: string | null = null;

function ensureConfigured(): boolean {
  const config = readPushConfig();
  if (!config) return false;
  const key = `${config.subject}|${config.publicKey}`;
  if (configuredWith !== key) {
    webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
    configuredWith = key;
  }
  return true;
}

/** Never throws: every failure becomes an outcome the caller records. */
export async function sendPush(
  sub: StoredSubscription,
  payload: PushPayload,
): Promise<SendOutcome> {
  if (!ensureConfigured()) return "retry";
  try {
    const result = await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload),
      // A reminder that arrives a day late is noise; 12h covers a phone that
      // was off overnight.
      { TTL: 60 * 60 * 12, timeout: 10_000 },
    );
    return classifySendResult(result);
  } catch (error) {
    const statusCode = (error as { statusCode?: number }).statusCode;
    const outcome = classifySendResult({ statusCode });
    if (outcome === "invalid") {
      console.error("push: payload rejected", statusCode, (error as { body?: string }).body);
    }
    return outcome;
  }
}

export async function applySubscriptionEffect(
  subscriptionId: string,
  effect: SubscriptionEffect,
): Promise<void> {
  try {
    if (effect.kind === "success") {
      await db.pushSubscription.updateMany({
        where: { id: subscriptionId },
        data: { lastSuccessAt: new Date(), failureCount: 0 },
      });
    } else if (effect.kind === "delete") {
      await db.pushSubscription.deleteMany({ where: { id: subscriptionId } });
    } else if (effect.kind === "fail") {
      await db.pushSubscription.updateMany({
        where: { id: subscriptionId },
        data: { failureCount: effect.failureCount },
      });
    }
  } catch (error) {
    console.error("push: could not record subscription outcome", error);
  }
}
