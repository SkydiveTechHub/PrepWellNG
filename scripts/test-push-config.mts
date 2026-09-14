import { test } from "node:test";
import assert from "node:assert/strict";
import { readCronSecret, readPushConfig } from "../src/lib/push-config";

const full = {
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: "pub",
  VAPID_PRIVATE_KEY: "priv",
  VAPID_SUBJECT: "mailto:hello@scholarscrib.com",
  CRON_SECRET: "s3cret-value-long-enough",
};

test("all three VAPID values give a config", () => {
  assert.deepEqual(readPushConfig(full), {
    publicKey: "pub",
    privateKey: "priv",
    subject: "mailto:hello@scholarscrib.com",
  });
});

test("any missing or blank VAPID value turns push off", () => {
  for (const key of ["NEXT_PUBLIC_VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"]) {
    assert.equal(readPushConfig({ ...full, [key]: undefined }), null, key);
    assert.equal(readPushConfig({ ...full, [key]: "  " }), null, key);
  }
});

test("the subject must be a mailto: or https: URL", () => {
  assert.equal(readPushConfig({ ...full, VAPID_SUBJECT: "hello@scholarscrib.com" }), null);
  assert.ok(readPushConfig({ ...full, VAPID_SUBJECT: "https://scholarscrib.com" }));
});

test("cron secret is trimmed and must be at least 16 characters", () => {
  assert.equal(readCronSecret(full), "s3cret-value-long-enough");
  assert.equal(readCronSecret({ CRON_SECRET: "short" }), null);
  assert.equal(readCronSecret({}), null);
});
