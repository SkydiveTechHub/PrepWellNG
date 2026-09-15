import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CONFIRM_TYPED_THRESHOLD,
  announcementInputSchema,
  expiresAtFrom,
  needsTypedConfirm,
  testSendSchema,
} from "../src/lib/announcement";

const valid = { title: "New mock exam", body: "JAMB mock 3 is live.", url: "/practice", audience: {}, expiresInDays: 7 };

test("a valid announcement parses, trimming text", () => {
  const parsed = announcementInputSchema.parse({ ...valid, title: "  New mock exam  " });
  assert.equal(parsed.title, "New mock exam");
  assert.equal(parsed.url, "/practice");
});

test("limits: title 60, body 180, expiry 1-30 days (default 7)", () => {
  assert.equal(announcementInputSchema.safeParse({ ...valid, title: "t".repeat(61) }).success, false);
  assert.equal(announcementInputSchema.safeParse({ ...valid, body: "b".repeat(181) }).success, false);
  assert.equal(announcementInputSchema.safeParse({ ...valid, title: "   " }).success, false);
  assert.equal(announcementInputSchema.safeParse({ ...valid, expiresInDays: 31 }).success, false);
  assert.equal(announcementInputSchema.safeParse({ ...valid, expiresInDays: 0 }).success, false);
  const noExpiry = { title: valid.title, body: valid.body, url: valid.url, audience: valid.audience };
  assert.equal(announcementInputSchema.parse(noExpiry).expiresInDays, 7);
});

test("links must be internal paths; blank becomes null", () => {
  assert.equal(announcementInputSchema.safeParse({ ...valid, url: "https://evil.com" }).success, false);
  assert.equal(announcementInputSchema.safeParse({ ...valid, url: "//evil.com" }).success, false);
  assert.equal(announcementInputSchema.parse({ ...valid, url: "" }).url, null);
  assert.equal(announcementInputSchema.parse({ ...valid, url: null }).url, null);
});

test("audience is validated", () => {
  assert.equal(announcementInputSchema.safeParse({ ...valid, audience: { tiers: ["GOLD"] } }).success, false);
});

test("test send needs a contact", () => {
  assert.equal(testSendSchema.safeParse({ ...valid, contact: "" }).success, false);
  assert.equal(testSendSchema.parse({ ...valid, contact: " me@example.com " }).contact, "me@example.com");
});

test("typed confirmation from 500 devices", () => {
  assert.equal(CONFIRM_TYPED_THRESHOLD, 500);
  assert.equal(needsTypedConfirm(499), false);
  assert.equal(needsTypedConfirm(500), true);
});

test("expiry date", () => {
  assert.equal(
    expiresAtFrom(new Date("2026-09-14T10:00:00Z"), 7).toISOString(),
    "2026-09-21T10:00:00.000Z",
  );
});
