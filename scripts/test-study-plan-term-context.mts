import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fallbackTerms,
  hasTermCoverage,
  resolveTermContext,
  termHeaderLabel,
  validateTermRanges,
  type TermRange,
} from "../src/engines/planner/term-context";

const FIRST: TermRange = { session: "2026/2027", term: "FIRST", startsOn: "2026-09-08", endsOn: "2026-12-15" };
const SECOND: TermRange = { session: "2026/2027", term: "SECOND", startsOn: "2027-01-06", endsOn: "2027-04-10" };

test("in term: Monday-based week numbering", () => {
  const ctx = resolveTermContext("2026-09-14", [FIRST, SECOND]);
  assert.equal(ctx.kind, "in_term");
  if (ctx.kind !== "in_term") return;
  assert.equal(ctx.source, "configured");
  assert.equal(ctx.current.term, "FIRST");
  // Term starts Tue 8 Sep, so week 1 is the week of Mon 7 Sep.
  assert.equal(ctx.weekOfTerm, 2);
  assert.equal(ctx.totalWeeks, 15);
  assert.equal(ctx.weeksLeft, 13);
});

test("the first and last day of a term are in term", () => {
  assert.equal(resolveTermContext("2026-09-08", [FIRST]).kind, "in_term");
  assert.equal(resolveTermContext("2026-12-15", [FIRST]).kind, "in_term");
});

test("holiday between terms names both sides", () => {
  const ctx = resolveTermContext("2026-12-20", [FIRST, SECOND]);
  assert.equal(ctx.kind, "holiday");
  if (ctx.kind !== "holiday") return;
  assert.equal(ctx.previous?.term, "FIRST");
  assert.equal(ctx.next?.term, "SECOND");
});

test("no configured terms falls back to the built-in calendar", () => {
  const ctx = resolveTermContext("2026-09-14", []);
  assert.equal(ctx.source, "fallback");
  assert.equal(ctx.kind, "in_term");
});

test("a configured calendar far from today is ignored", () => {
  const old: TermRange = { session: "2024/2025", term: "FIRST", startsOn: "2024-09-09", endsOn: "2024-12-13" };
  assert.equal(resolveTermContext("2026-09-14", [old]).source, "fallback");
});

test("fallback covers every day of the year", () => {
  for (const day of ["2026-01-02", "2026-04-20", "2026-08-01", "2026-09-14", "2026-12-31"]) {
    const ctx = resolveTermContext(day, fallbackTerms(day));
    if (ctx.kind === "holiday") {
      assert.ok(ctx.previous || ctx.next, `no neighbour term for ${day}`);
    }
  }
});

test("validateTermRanges flags bad dates, overlaps and duplicates", () => {
  assert.deepEqual(validateTermRanges([FIRST, SECOND]), []);
  assert.equal(
    validateTermRanges([{ ...FIRST, endsOn: "2026-09-01" }]).length,
    1,
  );
  assert.equal(
    validateTermRanges([FIRST, { ...SECOND, startsOn: "2026-12-01" }]).length,
    1,
  );
  assert.equal(validateTermRanges([FIRST, { ...FIRST }]).length > 0, true);
  assert.equal(validateTermRanges([{ ...FIRST, session: "2026/2028" }]).length, 1);
});

test("hasTermCoverage looks at today and the next 30 days", () => {
  assert.equal(hasTermCoverage([FIRST], "2026-09-14"), true);
  assert.equal(hasTermCoverage([FIRST], "2026-12-20"), false);
  assert.equal(hasTermCoverage([SECOND], "2026-12-20"), true);
});

test("termHeaderLabel", () => {
  assert.equal(termHeaderLabel(resolveTermContext("2026-09-14", [FIRST])), "1st term · Week 2 of 15");
  assert.equal(
    termHeaderLabel(resolveTermContext("2026-12-20", [FIRST, SECOND])),
    "Holiday — revising 1st term",
  );
});
