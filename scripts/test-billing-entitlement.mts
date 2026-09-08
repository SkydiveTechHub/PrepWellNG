import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveTier,
  type EntitlementRow,
} from "../src/lib/billing/entitlement";

const NOW = new Date("2026-09-04T10:00:00.000Z");

function row(over: Partial<EntitlementRow> = {}): EntitlementRow {
  return {
    tier: "PREMIUM",
    status: "ACTIVE",
    startsAt: new Date("2026-09-01T00:00:00.000Z"),
    endsAt: new Date("2026-10-01T00:00:00.000Z"),
    ...over,
  };
}

test("no rows means freemium", () => {
  assert.deepEqual(resolveTier([], NOW), { tier: "FREEMIUM", expiresAt: null });
});

test("a covering active row grants its tier", () => {
  const result = resolveTier([row()], NOW);
  assert.equal(result.tier, "PREMIUM");
  assert.equal(result.expiresAt?.toISOString(), "2026-10-01T00:00:00.000Z");
});

test("an expired row grants nothing", () => {
  const expired = row({ endsAt: new Date("2026-08-01T00:00:00.000Z") });
  assert.deepEqual(resolveTier([expired], NOW), {
    tier: "FREEMIUM",
    expiresAt: null,
  });
});

test("endsAt is exclusive", () => {
  // A term ending at exactly now has ended. Without this the last instant of a
  // subscription is ambiguous, and the boundary is exactly where a renewal
  // hands over.
  const ending = row({ endsAt: NOW });
  assert.equal(resolveTier([ending], NOW).tier, "FREEMIUM");
});

test("startsAt is inclusive", () => {
  const starting = row({ startsAt: NOW });
  assert.equal(resolveTier([starting], NOW).tier, "PREMIUM");
});

test("a future row grants nothing yet", () => {
  const future = row({
    startsAt: new Date("2026-11-01T00:00:00.000Z"),
    endsAt: new Date("2026-12-01T00:00:00.000Z"),
  });
  assert.equal(resolveTier([future], NOW).tier, "FREEMIUM");
});

test("non-active statuses are ignored", () => {
  for (const status of ["PENDING", "FAILED", "ABANDONED", "REVOKED"] as const) {
    assert.equal(resolveTier([row({ status })], NOW).tier, "FREEMIUM", status);
  }
});

test("the richest overlapping tier wins, not the newest", () => {
  // A comped PREMIUM overlapping a paid STANDARD must resolve in the
  // student's favour, whichever was created first.
  const standard = row({ tier: "STANDARD" });
  const premium = row({ tier: "PREMIUM" });
  assert.equal(resolveTier([premium, standard], NOW).tier, "PREMIUM");
  assert.equal(resolveTier([standard, premium], NOW).tier, "PREMIUM");
});

test("expiry reports the furthest end among rows of the winning tier", () => {
  const near = row({ endsAt: new Date("2026-10-01T00:00:00.000Z") });
  const far = row({ endsAt: new Date("2027-01-01T00:00:00.000Z") });
  const result = resolveTier([near, far], NOW);
  assert.equal(result.expiresAt?.toISOString(), "2027-01-01T00:00:00.000Z");
});

test("a null endsAt never covers now", () => {
  // A PENDING row promoted by a buggy write must not become an endless grant.
  const open = row({ endsAt: null });
  assert.equal(resolveTier([open], NOW).tier, "FREEMIUM");
});
