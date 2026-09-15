import { test } from "node:test";
import assert from "node:assert/strict";
import {
  notificationPreferencesSchema,
  pushSubscriptionSchema,
  unsubscribeSchema,
} from "../src/lib/push-validators";

const p256dh = "B" + "A".repeat(86); // 87 chars, base64url of 65 bytes
const auth = "A".repeat(22); // base64url of 16 bytes
const valid = {
  endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
  expirationTime: null,
  keys: { p256dh, auth },
};

test("a browser subscription JSON is accepted and trimmed to what we store", () => {
  const parsed = pushSubscriptionSchema.parse(valid);
  assert.deepEqual(parsed, { endpoint: valid.endpoint, keys: { p256dh, auth } });
});

test("endpoints must be https and at most 1024 characters", () => {
  assert.equal(pushSubscriptionSchema.safeParse({ ...valid, endpoint: "http://fcm.googleapis.com/x" }).success, false);
  assert.equal(pushSubscriptionSchema.safeParse({ ...valid, endpoint: "not a url" }).success, false);
  assert.equal(
    pushSubscriptionSchema.safeParse({ ...valid, endpoint: "https://x.com/" + "a".repeat(1020) }).success,
    false,
  );
});

test("keys must be base64url of plausible length", () => {
  assert.equal(pushSubscriptionSchema.safeParse({ ...valid, keys: { p256dh: "short", auth } }).success, false);
  assert.equal(pushSubscriptionSchema.safeParse({ ...valid, keys: { p256dh, auth: "!!!!!!!!!!!!!!!!!!!!!!" } }).success, false);
  assert.equal(pushSubscriptionSchema.safeParse({ endpoint: valid.endpoint }).success, false);
});

test("unsubscribe needs an endpoint", () => {
  assert.equal(unsubscribeSchema.safeParse({ endpoint: valid.endpoint }).success, true);
  assert.equal(unsubscribeSchema.safeParse({}).success, false);
});

test("preference patches need at least one boolean", () => {
  assert.deepEqual(notificationPreferencesSchema.parse({ streakReminders: false }), { streakReminders: false });
  assert.equal(notificationPreferencesSchema.safeParse({}).success, false);
  assert.equal(notificationPreferencesSchema.safeParse({ studyReminders: "yes" }).success, false);
  assert.equal(notificationPreferencesSchema.safeParse({ somethingElse: true }).success, false);
});
