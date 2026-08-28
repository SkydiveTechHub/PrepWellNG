import { test } from "node:test";
import assert from "node:assert/strict";
import { pageWindow } from "../src/components/admin/pagination";

test("a full first page reports its range one-indexed", () => {
  const w = pageWindow({ page: 1, pageSize: 25, total: 80 });
  assert.equal(w.from, 1);
  assert.equal(w.to, 25);
  assert.equal(w.totalPages, 4);
  assert.equal(w.hasPrev, false);
  assert.equal(w.hasNext, true);
});

test("the last page stops at the total, not at a full page boundary", () => {
  const w = pageWindow({ page: 4, pageSize: 25, total: 80 });
  assert.equal(w.from, 76);
  assert.equal(w.to, 80);
  assert.equal(w.hasNext, false);
});

test("an empty result set is one page showing zero of zero", () => {
  // totalPages 0 would make "Page 1 of 0" render, which reads as a bug.
  const w = pageWindow({ page: 1, pageSize: 25, total: 0 });
  assert.equal(w.totalPages, 1);
  assert.equal(w.from, 0);
  assert.equal(w.to, 0);
  assert.equal(w.hasPrev, false);
  assert.equal(w.hasNext, false);
});

test("a page beyond the end is clamped to the last page", () => {
  // ?page=999 is one hand-edited URL away and must not render an empty table
  // with a live Next button.
  const w = pageWindow({ page: 999, pageSize: 25, total: 80 });
  assert.equal(w.page, 4);
  assert.equal(w.hasNext, false);
});

test("a page below one is clamped up", () => {
  const w = pageWindow({ page: -3, pageSize: 25, total: 80 });
  assert.equal(w.page, 1);
  assert.equal(w.hasPrev, false);
});

test("a single partial page has neither neighbour", () => {
  const w = pageWindow({ page: 1, pageSize: 25, total: 7 });
  assert.equal(w.totalPages, 1);
  assert.equal(w.to, 7);
  assert.equal(w.hasPrev, false);
  assert.equal(w.hasNext, false);
});
