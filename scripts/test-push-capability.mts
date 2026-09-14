import { test } from "node:test";
import assert from "node:assert/strict";
import {
  OPT_IN_SNOOZE_MS,
  REQUIRED_WORKER_VERSION,
  detectIOS,
  isOptInSnoozed,
  isPushWorkerVersion,
  pushCapability,
  type PushEnvSnapshot,
} from "../src/lib/push-capability";

const base: PushEnvSnapshot = {
  configured: true,
  hasServiceWorker: true,
  hasPushManager: true,
  hasNotification: true,
  permission: "default",
  isIOS: false,
  isStandalone: false,
  hasSubscription: false,
};
const cap = (patch: Partial<PushEnvSnapshot>) => pushCapability({ ...base, ...patch });

test("a capable browser that has not been asked can be asked", () => {
  assert.equal(cap({}), "default");
});

test("not configured on the server is unsupported everywhere", () => {
  assert.equal(cap({ configured: false }), "unsupported");
  assert.equal(cap({ configured: false, isIOS: true }), "unsupported");
});

test("missing browser APIs are unsupported", () => {
  assert.equal(cap({ hasServiceWorker: false }), "unsupported");
  assert.equal(cap({ hasPushManager: false }), "unsupported");
  assert.equal(cap({ hasNotification: false }), "unsupported");
});

test("iOS in a Safari tab needs installing, even though PushManager is absent there", () => {
  assert.equal(cap({ isIOS: true, isStandalone: false, hasPushManager: false }), "ios-needs-install");
  assert.equal(cap({ isIOS: true, isStandalone: true }), "default");
});

test("denied permission is never prompted", () => {
  assert.equal(cap({ permission: "denied" }), "denied");
  assert.equal(cap({ permission: "denied", hasSubscription: true }), "denied");
});

test("granted with a subscription is subscribed; granted without one can re-subscribe", () => {
  assert.equal(cap({ permission: "granted", hasSubscription: true }), "subscribed");
  assert.equal(cap({ permission: "granted", hasSubscription: false }), "default");
});

test("iOS detection covers iPhone and iPadOS reporting as a Mac", () => {
  assert.equal(detectIOS({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)", maxTouchPoints: 5 }), true);
  assert.equal(detectIOS({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", maxTouchPoints: 5 }), true);
  assert.equal(detectIOS({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", maxTouchPoints: 0 }), false);
  assert.equal(detectIOS({ userAgent: "Mozilla/5.0 (Linux; Android 14)", maxTouchPoints: 5 }), false);
});

test("only the push-capable worker version passes", () => {
  assert.equal(REQUIRED_WORKER_VERSION, "v2");
  assert.equal(isPushWorkerVersion("v2"), true);
  assert.equal(isPushWorkerVersion("v1"), false);
  assert.equal(isPushWorkerVersion(null), false);
});

test("Not now snoozes the opt-in card for 14 days", () => {
  const now = Date.UTC(2026, 8, 15);
  assert.equal(OPT_IN_SNOOZE_MS, 14 * 24 * 60 * 60 * 1000);
  assert.equal(isOptInSnoozed(null, now), false);
  assert.equal(isOptInSnoozed(now - OPT_IN_SNOOZE_MS + 1, now), true);
  assert.equal(isOptInSnoozed(now - OPT_IN_SNOOZE_MS, now), false);
  assert.equal(isOptInSnoozed(Number.NaN, now), false);
});
