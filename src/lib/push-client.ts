"use client";

import {
  detectIOS,
  isPushWorkerVersion,
  pushCapability,
  type PushCapability,
  type PushEnvSnapshot,
} from "@/lib/push-capability";

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function hasPushApis(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

async function currentSubscription(): Promise<PushSubscription | null> {
  if (!hasPushApis()) return null;
  const registration = await navigator.serviceWorker.getRegistration("/");
  return (await registration?.pushManager.getSubscription()) ?? null;
}

export async function readPushState(): Promise<PushCapability> {
  const apis = hasPushApis();
  const snapshot: PushEnvSnapshot = {
    configured: PUBLIC_KEY.length > 0,
    hasServiceWorker: typeof navigator !== "undefined" && "serviceWorker" in navigator,
    hasPushManager: typeof window !== "undefined" && "PushManager" in window,
    hasNotification: typeof window !== "undefined" && "Notification" in window,
    permission: apis ? (Notification.permission as PushEnvSnapshot["permission"]) : "default",
    isIOS: detectIOS({ userAgent: navigator.userAgent, maxTouchPoints: navigator.maxTouchPoints }),
    isStandalone: window.matchMedia("(display-mode: standalone)").matches,
    hasSubscription: apis ? (await currentSubscription().catch(() => null)) !== null : false,
  };
  return pushCapability(snapshot);
}

function workerVersion(registration: ServiceWorkerRegistration): Promise<string | null> {
  const worker = registration.active;
  if (!worker) return Promise.resolve(null);
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => resolve(null), 1500);
    channel.port1.onmessage = (event) => {
      clearTimeout(timer);
      resolve(typeof event.data?.version === "string" ? event.data.version : null);
    };
    worker.postMessage({ type: "GET_VERSION" }, [channel.port2]);
  });
}

async function postSubscription(subscription: PushSubscription): Promise<boolean> {
  const res = await fetch("/api/push/subscription", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(subscription.toJSON()),
  });
  return res.ok;
}

export type SubscribeResult = "subscribed" | "denied" | "needs-reload" | "unsupported" | "failed";

/** Call only from a click handler: the permission prompt needs a user gesture. */
export async function subscribeThisDevice(): Promise<SubscribeResult> {
  if (!hasPushApis() || !PUBLIC_KEY) return "unsupported";
  try {
    const registration = await navigator.serviceWorker.ready;
    // A v1 worker has no push handler; a subscription it owns would receive
    // pushes that show nothing.
    if (!isPushWorkerVersion(await workerVersion(registration))) return "needs-reload";

    const permission = await Notification.requestPermission();
    if (permission === "denied") return "denied";
    if (permission !== "granted") return "failed";

    const subscription =
      (await registration.pushManager.getSubscription()) ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(PUBLIC_KEY),
      }));
    return (await postSubscription(subscription)) ? "subscribed" : "failed";
  } catch (error) {
    console.error("Push subscribe failed", error);
    return "failed";
  }
}

/**
 * Removes this device on the server first (while the session still exists),
 * then in the browser. Bounded to 3s so sign-out never hangs on it.
 */
export async function unsubscribeThisDevice(): Promise<void> {
  const work = (async () => {
    const subscription = await currentSubscription();
    if (!subscription) return;
    await fetch("/api/push/subscription", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    }).catch(() => undefined);
    await subscription.unsubscribe().catch(() => undefined);
  })().catch(() => undefined);
  await Promise.race([work, new Promise((resolve) => setTimeout(resolve, 3000))]);
}

/** Browsers rotate endpoints; a cheap upsert on load keeps the server current. */
export async function syncThisDevice(): Promise<void> {
  try {
    if (!hasPushApis() || Notification.permission !== "granted") return;
    const subscription = await currentSubscription();
    if (subscription) await postSubscription(subscription);
  } catch {
    // Offline or signed out mid-request. The next load tries again.
  }
}
