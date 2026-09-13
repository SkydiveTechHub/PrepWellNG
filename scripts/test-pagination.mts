import { test } from "node:test";
import assert from "node:assert/strict";
import { pageHref, pageWindow } from "../src/components/ui/pagination";

// Mirrors of DASHBOARD_ATTEMPTS_PAGE_SIZE and PERFORMANCE_ATTEMPTS_PAGE_SIZE.
// Copied rather than imported: those modules pull in the Prisma client, and
// these tests stay dependency-free like the rest of the suite.
const DASHBOARD_PAGE_SIZE = 5;
const PERFORMANCE_PAGE_SIZE = 10;

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

test("page 1 links carry no page key, so the first page has one URL", () => {
  assert.equal(pageHref("/performance", {}, 1, "page"), "/performance");
  assert.equal(pageHref("/dashboard", {}, 1, "activity"), "/dashboard");
});

test("a later page is addressed by the caller's own query key", () => {
  // Two paged lists on one route must not fight over `?page=`.
  assert.equal(pageHref("/performance", {}, 3, "page"), "/performance?page=3");
  assert.equal(pageHref("/dashboard", {}, 3, "activity"), "/dashboard?activity=3");
});

test("existing filters survive a page change", () => {
  assert.equal(
    pageHref("/admin/audit", { actor: "abc", range: "30d" }, 2, "page"),
    "/admin/audit?actor=abc&range=30d&page=2",
  );
});

test("a stale page key is dropped on the way back to page 1", () => {
  assert.equal(pageHref("/admin/audit", { page: "7", actor: "abc" }, 1, "page"), "/admin/audit?actor=abc");
});

test("the dashboard activity section pages five at a time", () => {
  const w = pageWindow({ page: 2, pageSize: DASHBOARD_PAGE_SIZE, total: 13 });
  assert.equal(w.from, 6);
  assert.equal(w.to, 10);
  assert.equal(w.totalPages, 3);
  assert.equal(w.hasPrev, true);
  assert.equal(w.hasNext, true);
});

test("the last dashboard activity page stops at the attempt total", () => {
  const w = pageWindow({ page: 3, pageSize: DASHBOARD_PAGE_SIZE, total: 13 });
  assert.equal(w.from, 11);
  assert.equal(w.to, 13);
  assert.equal(w.hasNext, false);
});

test("the attempt history pages ten at a time", () => {
  const w = pageWindow({ page: 2, pageSize: PERFORMANCE_PAGE_SIZE, total: 24 });
  assert.equal(w.from, 11);
  assert.equal(w.to, 20);
  assert.equal(w.totalPages, 3);
});

test("a single page of attempts hides the pager entirely", () => {
  // The component returns null at totalPages <= 1, so a student with four
  // attempts never sees Prev/Next at all.
  const w = pageWindow({ page: 1, pageSize: DASHBOARD_PAGE_SIZE, total: 4 });
  assert.equal(w.totalPages, 1);
});
