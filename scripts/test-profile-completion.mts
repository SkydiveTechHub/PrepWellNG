import { test } from "node:test";
import assert from "node:assert/strict";
import { isProfileComplete, needsProfileCompletion } from "../src/lib/profile-completion";
import { completeProfileSchema } from "../src/lib/validators";

const complete = { classLevel: "SS2", track: "SCIENCE", state: "Lagos" };

test("a row with class, track and a listed state is complete", () => {
  assert.equal(isProfileComplete(complete), true);
});

test("any missing field makes a row incomplete", () => {
  assert.equal(isProfileComplete({ ...complete, classLevel: null }), false);
  assert.equal(isProfileComplete({ ...complete, track: null }), false);
  assert.equal(isProfileComplete({ ...complete, state: null }), false);
  assert.equal(isProfileComplete({ ...complete, state: "" }), false);
});

test("a free-text state from before the list was enforced counts as missing", () => {
  assert.equal(isProfileComplete({ ...complete, state: "lagos" }), false);
  assert.equal(isProfileComplete({ ...complete, state: "Rivers State" }), false);
});

test("the session gate fires only on a field known to be missing", () => {
  assert.equal(needsProfileCompletion(complete), false);
  assert.equal(needsProfileCompletion({ ...complete, state: null }), true);
  assert.equal(needsProfileCompletion({ ...complete, track: null }), true);
  assert.equal(needsProfileCompletion({ ...complete, state: "Atlantis" }), true);
});

test("a session cached before `state` was added is not gated", () => {
  // Its profile has no `state` key at all. Gating it would bounce a student
  // whose row is complete between the dashboard and /complete-profile until
  // the cache refreshes.
  assert.equal(needsProfileCompletion({ classLevel: "SS2", track: "ARTS" }), false);
});

test("a session with no cached profile is not gated", () => {
  // The sign-in profile read failed; the cache is empty, not the row.
  assert.equal(needsProfileCompletion({}), false);
});

test("the gate and the page agree on every row the database can hold", () => {
  // A row the page calls complete must never be gated, or the two redirect
  // into each other.
  const rows = [
    complete,
    { ...complete, classLevel: null },
    { ...complete, state: null },
    { ...complete, state: "" },
    { ...complete, state: "lagos" },
    { classLevel: null, track: null, state: null },
  ];
  for (const row of rows) {
    assert.equal(needsProfileCompletion(row), !isProfileComplete(row), JSON.stringify(row));
  }
});

test("the completion schema requires all three fields", () => {
  assert.equal(completeProfileSchema.safeParse(complete).success, true);
  assert.equal(completeProfileSchema.safeParse({ ...complete, state: undefined }).success, false);
  assert.equal(completeProfileSchema.safeParse({ ...complete, state: "" }).success, false);
  assert.equal(completeProfileSchema.safeParse({ ...complete, classLevel: undefined }).success, false);
  assert.equal(completeProfileSchema.safeParse({ ...complete, track: "MUSIC" }).success, false);
});
