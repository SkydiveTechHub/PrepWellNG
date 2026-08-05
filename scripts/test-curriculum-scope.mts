import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ALL_SCOPES,
  MAX_ORDINAL,
  describeScopeRange,
  expandScopeRange,
  isValidScope,
  ordinalToScope,
  scopeLabel,
  scopeOrdinal,
  scopeSpan,
  type ScopePoint,
} from "../src/lib/curriculum-scope";

const at = (classLevel: string, term: string) =>
  ({ classLevel, term }) as ScopePoint;

// ─── Ordering ──────────────────────────────────────────────

test("the syllabus is nine ordered slots", () => {
  assert.equal(ALL_SCOPES.length, 9);
  assert.equal(MAX_ORDINAL, 8);
});

test("ordinals run SS1 1st through SS3 3rd", () => {
  assert.equal(scopeOrdinal(at("SS1", "FIRST")), 0);
  assert.equal(scopeOrdinal(at("SS1", "THIRD")), 2);
  assert.equal(scopeOrdinal(at("SS2", "FIRST")), 3);
  assert.equal(scopeOrdinal(at("SS3", "THIRD")), 8);
});

test("terms sort by curriculum order, not alphabetically", () => {
  // "FIRST" < "SECOND" < "THIRD" alphabetically puts FIRST before SECOND by
  // luck, but THIRD before SECOND is wrong — hence the explicit ordering.
  assert.ok(
    scopeOrdinal(at("SS1", "SECOND")) < scopeOrdinal(at("SS1", "THIRD")),
  );
});

test("ordinalToScope round-trips", () => {
  for (const scope of ALL_SCOPES) {
    assert.deepEqual(ordinalToScope(scopeOrdinal(scope)), scope);
  }
});

// ─── Validation ────────────────────────────────────────────

test("valid scopes are accepted", () => {
  assert.equal(isValidScope({ classLevel: "SS2", term: "SECOND" }), true);
});

test("junior classes and bad terms are rejected", () => {
  assert.equal(isValidScope({ classLevel: "JSS3", term: "FIRST" }), false);
  assert.equal(isValidScope({ classLevel: "SS1", term: "FOURTH" }), false);
  assert.equal(isValidScope(null), false);
  assert.equal(isValidScope("SS1"), false);
  assert.equal(isValidScope({}), false);
});

// ─── Range expansion ───────────────────────────────────────

test("a single term expands to just itself", () => {
  const range = expandScopeRange(at("SS2", "SECOND"), at("SS2", "SECOND"));
  assert.equal(range.length, 1);
  assert.deepEqual(range[0], at("SS2", "SECOND"));
});

test("a whole class year expands to its three terms", () => {
  // The user's example: SS1 1st term to SS1 3rd term.
  const range = expandScopeRange(at("SS1", "FIRST"), at("SS1", "THIRD"));
  assert.equal(range.length, 3);
  assert.deepEqual(
    range.map(scopeLabel),
    ["SS1 1st term", "SS1 2nd term", "SS1 3rd term"],
  );
});

test("a range spans across class levels", () => {
  const range = expandScopeRange(at("SS1", "THIRD"), at("SS2", "SECOND"));
  assert.deepEqual(
    range.map(scopeLabel),
    ["SS1 3rd term", "SS2 1st term", "SS2 2nd term"],
  );
});

test("the full syllabus expands to all nine slots", () => {
  const range = expandScopeRange(at("SS1", "FIRST"), at("SS3", "THIRD"));
  assert.equal(range.length, 9);
});

test("a reversed range is normalised rather than rejected", () => {
  // Two dropdowns make this an easy slip; it is not a different intent.
  const forward = expandScopeRange(at("SS1", "FIRST"), at("SS2", "FIRST"));
  const reversed = expandScopeRange(at("SS2", "FIRST"), at("SS1", "FIRST"));
  assert.deepEqual(reversed, forward);
});

// ─── Span ──────────────────────────────────────────────────

test("span counts slots inclusively", () => {
  assert.equal(scopeSpan(at("SS1", "FIRST"), at("SS1", "FIRST")), 1);
  assert.equal(scopeSpan(at("SS1", "FIRST"), at("SS1", "THIRD")), 3);
  assert.equal(scopeSpan(at("SS1", "FIRST"), at("SS3", "THIRD")), 9);
});

test("span is direction-agnostic", () => {
  assert.equal(scopeSpan(at("SS3", "THIRD"), at("SS1", "FIRST")), 9);
});

// ─── Labels ────────────────────────────────────────────────

test("a slot reads as class plus ordinal term", () => {
  assert.equal(scopeLabel(at("SS2", "SECOND")), "SS2 2nd term");
  assert.equal(scopeLabel(at("SS3", "THIRD")), "SS3 3rd term");
});

test("a single-slot range reads as that slot", () => {
  assert.equal(
    describeScopeRange(at("SS2", "SECOND"), at("SS2", "SECOND")),
    "SS2 2nd term",
  );
});

test("a full class year reads as 'all of SS1'", () => {
  assert.equal(
    describeScopeRange(at("SS1", "FIRST"), at("SS1", "THIRD")),
    "all of SS1",
  );
});

test("a partial range reads as from-to", () => {
  assert.equal(
    describeScopeRange(at("SS1", "THIRD"), at("SS2", "SECOND")),
    "SS1 3rd term to SS2 2nd term",
  );
});

test("a reversed range still reads low-to-high", () => {
  assert.equal(
    describeScopeRange(at("SS2", "SECOND"), at("SS1", "THIRD")),
    "SS1 3rd term to SS2 2nd term",
  );
});
