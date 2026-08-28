import { test } from "node:test";
import assert from "node:assert/strict";
import {
  STUDENT_PAGE_SIZE,
  fullName,
  isTrack,
  normaliseStudentFilter,
  studentFilterParams,
} from "../src/lib/admin-student";
import { studentProfileSchema, studentStatusSchema, studentTierSchema } from "../src/lib/validators";

test("empty params give an unfiltered first page", () => {
  const f = normaliseStudentFilter({});
  assert.deepEqual(f, {
    search: null,
    classLevel: null,
    track: null,
    tier: null,
    status: null,
    page: 1,
  });
});

test("recognised values pass through", () => {
  const f = normaliseStudentFilter({
    q: "ada",
    class: "SS2",
    track: "SCIENCE",
    tier: "PREMIUM",
    status: "suspended",
    page: "3",
  });
  assert.equal(f.search, "ada");
  assert.equal(f.classLevel, "SS2");
  assert.equal(f.track, "SCIENCE");
  assert.equal(f.tier, "PREMIUM");
  assert.equal(f.status, "suspended");
  assert.equal(f.page, 3);
});

test("unrecognised enum values are dropped, not passed to Prisma", () => {
  // A hand-edited URL would otherwise become a where clause on an enum column
  // and throw at query time.
  const f = normaliseStudentFilter({
    class: "SS9",
    track: "MUSIC",
    tier: "GOLD",
    status: "deleted",
  });
  assert.equal(f.classLevel, null);
  assert.equal(f.track, null);
  assert.equal(f.tier, null);
  assert.equal(f.status, null);
});

test("enum matching is case sensitive", () => {
  const f = normaliseStudentFilter({ track: "science", tier: "premium" });
  assert.equal(f.track, null);
  assert.equal(f.tier, null);
});

test("search is trimmed, and whitespace-only is no search at all", () => {
  assert.equal(normaliseStudentFilter({ q: "  ada  " }).search, "ada");
  assert.equal(normaliseStudentFilter({ q: "   " }).search, null);
  assert.equal(normaliseStudentFilter({ q: "" }).search, null);
});

test("a non-numeric or out-of-range page falls back to one", () => {
  assert.equal(normaliseStudentFilter({ page: "abc" }).page, 1);
  assert.equal(normaliseStudentFilter({ page: "0" }).page, 1);
  assert.equal(normaliseStudentFilter({ page: "-4" }).page, 1);
  assert.equal(normaliseStudentFilter({ page: "" }).page, 1);
  assert.equal(normaliseStudentFilter({ page: "2.7" }).page, 2);
});

test("filter params round-trip, omitting the empties", () => {
  const f = normaliseStudentFilter({ q: "ada", tier: "STANDARD" });
  assert.deepEqual(studentFilterParams(f), { q: "ada", tier: "STANDARD" });
});

test("page is never written into the round-tripped params", () => {
  // Pagination owns the page key; duplicating it here would fight it.
  const f = normaliseStudentFilter({ q: "ada", page: "5" });
  assert.equal("page" in studentFilterParams(f), false);
});

test("isTrack accepts only the three tracks", () => {
  assert.equal(isTrack("COMMERCIAL"), true);
  assert.equal(isTrack("commercial"), false);
  assert.equal(isTrack(undefined), false);
});

test("page size is a round number of rows", () => {
  assert.equal(STUDENT_PAGE_SIZE, 25);
});

test("fullName joins the two halves with a single space", () => {
  assert.equal(fullName({ firstName: "Ada", lastName: "Obi" }), "Ada Obi");
});

test("the profile schema requires both names", () => {
  const bad = studentProfileSchema.safeParse({ firstName: "", lastName: "Obi" });
  assert.equal(bad.success, false);
});

test("the profile schema rejects a malformed email but allows none at all", () => {
  // Phone-only accounts exist, so email must be optional yet validated.
  assert.equal(
    studentProfileSchema.safeParse({ firstName: "Ada", lastName: "Obi", email: "nope" }).success,
    false,
  );
  assert.equal(
    studentProfileSchema.safeParse({ firstName: "Ada", lastName: "Obi" }).success,
    true,
  );
});

test("the profile schema rejects an unknown class level or track", () => {
  assert.equal(
    studentProfileSchema.safeParse({ firstName: "Ada", lastName: "Obi", classLevel: "SS9" }).success,
    false,
  );
  assert.equal(
    studentProfileSchema.safeParse({ firstName: "Ada", lastName: "Obi", track: "MUSIC" }).success,
    false,
  );
});

test("the status schema requires a reason when suspending", () => {
  // An audit row reading "suspended, no reason given" helps nobody later.
  assert.equal(studentStatusSchema.safeParse({ isActive: false }).success, false);
  assert.equal(
    studentStatusSchema.safeParse({ isActive: false, reason: "Payment dispute" }).success,
    true,
  );
});

test("the status schema needs no reason to reactivate", () => {
  assert.equal(studentStatusSchema.safeParse({ isActive: true }).success, true);
});

test("the tier schema accepts only the three tiers", () => {
  assert.equal(studentTierSchema.safeParse({ tier: "STANDARD" }).success, true);
  assert.equal(studentTierSchema.safeParse({ tier: "GOLD" }).success, false);
});
