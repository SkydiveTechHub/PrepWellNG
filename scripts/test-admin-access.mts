import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canAccessConsole,
  canManageAdmins,
  canDeactivate,
  normalizeIdentifier,
} from "../src/lib/admin-access";

test("an active admin may open the console", () => {
  assert.equal(canAccessConsole({ isActive: true }), true);
});

test("a deactivated admin may not, cookie notwithstanding", () => {
  // Revocation has to bite on the next request, not at cookie expiry.
  assert.equal(canAccessConsole({ isActive: false }), false);
});

test("a missing admin may not", () => {
  assert.equal(canAccessConsole(null), false);
});

test("only the owner manages admins", () => {
  assert.equal(canManageAdmins({ isActive: true, isOwner: true }), true);
  assert.equal(canManageAdmins({ isActive: true, isOwner: false }), false);
  assert.equal(canManageAdmins(null), false);
});

test("a deactivated owner manages nothing", () => {
  assert.equal(canManageAdmins({ isActive: false, isOwner: true }), false);
});

test("the owner cannot be deactivated, including by themselves", () => {
  // The only recovery from this would be re-running the bootstrap script.
  const owner = { id: "a1", isActive: true, isOwner: true };
  assert.equal(canDeactivate({ id: "a1", isOwner: true }, owner), false);
});

test("the owner may deactivate a regular admin", () => {
  const owner = { id: "a1", isActive: true, isOwner: true };
  assert.equal(canDeactivate({ id: "a2", isOwner: false }, owner), true);
});

test("a regular admin may deactivate nobody", () => {
  const plain = { id: "a2", isActive: true, isOwner: false };
  assert.equal(canDeactivate({ id: "a3", isOwner: false }, plain), false);
});

test("an email identifier is trimmed and lowercased", () => {
  assert.deepEqual(normalizeIdentifier("  Michael@Example.COM "), {
    email: "michael@example.com",
  });
});

test("a username identifier is trimmed and lowercased", () => {
  assert.deepEqual(normalizeIdentifier("  Michael "), { username: "michael" });
});

test("a username may not contain @", () => {
  // Keeps the two namespaces disjoint: no username can shadow another
  // admin's email address.
  assert.equal(normalizeIdentifier("mich@el"), null);
});

test("a malformed email is rejected rather than stored as a username", () => {
  assert.equal(normalizeIdentifier("michael@"), null);
  assert.equal(normalizeIdentifier("@example.com"), null);
});

test("a too-short or oversized username is rejected", () => {
  assert.equal(normalizeIdentifier("ab"), null);
  assert.equal(normalizeIdentifier("a".repeat(33)), null);
});

test("an empty identifier is rejected", () => {
  assert.equal(normalizeIdentifier("   "), null);
});

test("usernames allow dot, dash and underscore only", () => {
  assert.deepEqual(normalizeIdentifier("mike_g.1-x"), { username: "mike_g.1-x" });
  assert.equal(normalizeIdentifier("mike g"), null);
  assert.equal(normalizeIdentifier("mike!"), null);
});
