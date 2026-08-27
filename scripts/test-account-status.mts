import { test } from "node:test";
import assert from "node:assert/strict";
import {
  describeAccountStatus,
  isAccountStatus,
  isSessionRevoked,
} from "../src/lib/account-status";

// Token issued-at claims are seconds since the epoch, not milliseconds.
const ISSUED = Math.floor(new Date("2026-08-27T10:00:00Z").getTime() / 1000);
const BEFORE = new Date("2026-08-27T09:00:00Z");
const AFTER = new Date("2026-08-27T11:00:00Z");

test("an active account with no revocation stamp keeps its session", () => {
  assert.equal(
    isSessionRevoked({ isActive: true, sessionsValidFrom: null }, ISSUED),
    false,
  );
});

test("a suspended account loses its session regardless of issue time", () => {
  assert.equal(
    isSessionRevoked({ isActive: false, sessionsValidFrom: null }, ISSUED),
    true,
  );
});

test("a token issued before the revocation stamp is dead", () => {
  assert.equal(
    isSessionRevoked({ isActive: true, sessionsValidFrom: AFTER }, ISSUED),
    true,
  );
});

test("a token issued after the revocation stamp survives", () => {
  // Signing in again after a force sign-out has to work, or the account is
  // permanently locked out rather than merely signed out.
  assert.equal(
    isSessionRevoked({ isActive: true, sessionsValidFrom: BEFORE }, ISSUED),
    false,
  );
});

test("a token issued exactly at the stamp is dead", () => {
  const exact = Math.floor(AFTER.getTime() / 1000);
  // Second-granularity claims mean a same-second token could be the revoked
  // one. Treat the boundary as revoked rather than let it through.
  assert.equal(
    isSessionRevoked({ isActive: true, sessionsValidFrom: AFTER }, exact),
    true,
  );
});

test("a token with no issued-at claim is treated as revoked when a stamp exists", () => {
  // Cannot prove it is newer than the revocation, so it does not get the
  // benefit of the doubt.
  assert.equal(
    isSessionRevoked({ isActive: true, sessionsValidFrom: AFTER }, undefined),
    true,
  );
});

test("a token with no issued-at claim survives when no stamp exists", () => {
  assert.equal(
    isSessionRevoked({ isActive: true, sessionsValidFrom: null }, undefined),
    false,
  );
});

test("status descriptions distinguish active from suspended", () => {
  assert.equal(describeAccountStatus({ isActive: true }).tone, "success");
  assert.equal(describeAccountStatus({ isActive: false }).tone, "warning");
  assert.notEqual(
    describeAccountStatus({ isActive: true }).label,
    describeAccountStatus({ isActive: false }).label,
  );
});

test("isAccountStatus accepts only the two statuses", () => {
  assert.equal(isAccountStatus("active"), true);
  assert.equal(isAccountStatus("suspended"), true);
  assert.equal(isAccountStatus("ACTIVE"), false);
  assert.equal(isAccountStatus("deleted"), false);
  assert.equal(isAccountStatus(undefined), false);
  assert.equal(isAccountStatus(null), false);
});
