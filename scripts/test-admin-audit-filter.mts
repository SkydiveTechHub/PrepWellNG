import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AUDIT_PAGE_SIZE,
  auditFilterParams,
  normaliseAuditFilter,
} from "../src/lib/admin-audit-filter";

test("empty params give an unfiltered first page", () => {
  const f = normaliseAuditFilter({});
  assert.deepEqual(f, {
    actorId: null,
    action: null,
    entity: null,
    from: null,
    to: null,
    page: 1,
  });
});

test("a known action passes through", () => {
  assert.equal(normaliseAuditFilter({ action: "student.delete" }).action, "student.delete");
});

test("an unknown action is dropped", () => {
  // The column is free text, so an unknown value would not throw — it would
  // silently return nothing, which reads as "no such activity" rather than
  // "no such action".
  assert.equal(normaliseAuditFilter({ action: "student.launder" }).action, null);
});

test("valid dates parse and invalid ones are dropped", () => {
  const f = normaliseAuditFilter({ from: "2026-08-01", to: "2026-08-27" });
  assert.equal(f.from?.toISOString().slice(0, 10), "2026-08-01");
  assert.equal(f.to?.toISOString().slice(0, 10), "2026-08-27");
  assert.equal(normaliseAuditFilter({ from: "not-a-date" }).from, null);
  assert.equal(normaliseAuditFilter({ from: "" }).from, null);
});

test("a reversed range is dropped rather than returning nothing", () => {
  // from > to can only ever match zero rows; an empty table would look like
  // "nothing happened" instead of "your dates are backwards".
  const f = normaliseAuditFilter({ from: "2026-08-27", to: "2026-08-01" });
  assert.equal(f.from, null);
  assert.equal(f.to, null);
});

test("a non-numeric page falls back to one", () => {
  assert.equal(normaliseAuditFilter({ page: "abc" }).page, 1);
  assert.equal(normaliseAuditFilter({ page: "-2" }).page, 1);
});

test("filter params round-trip without the page", () => {
  const f = normaliseAuditFilter({ action: "student.tier", from: "2026-08-01", page: "4" });
  const params = auditFilterParams(f);
  assert.equal(params.action, "student.tier");
  assert.equal(params.from, "2026-08-01");
  assert.equal("page" in params, false);
});

test("the page size is larger than the student list's", () => {
  // Audit rows are one line each; a 25-row page would mean constant paging.
  assert.equal(AUDIT_PAGE_SIZE, 50);
});
