import { test } from "node:test";
import assert from "node:assert/strict";
import { summariseSubjects, toStatRows } from "../src/lib/admin-stats";

test("an empty database yields no rows and a zero total", () => {
  const summary = summariseSubjects([]);
  assert.deepEqual(summary.rows, []);
  assert.equal(summary.total, 0);
});

test("percentages are zero rather than NaN when the total is zero", () => {
  // The naive count/total renders "NaN%" on a fresh install.
  const rows = toStatRows([{ key: "WAEC", label: "WAEC", count: 0 }], 0);
  assert.equal(rows[0].percent, 0);
  assert.equal(Number.isNaN(rows[0].percent), false);
});

test("percentages are rounded to whole numbers", () => {
  const rows = toStatRows(
    [
      { key: "a", label: "A", count: 1 },
      { key: "b", label: "B", count: 2 },
    ],
    3,
  );
  assert.equal(rows[0].percent, 33);
  assert.equal(rows[1].percent, 67);
});

test("subjects are ordered by question count, descending", () => {
  const summary = summariseSubjects([
    { id: "1", name: "Maths", code: "MTH", questionCount: 5 },
    { id: "2", name: "Physics", code: "PHY", questionCount: 20 },
  ]);
  assert.deepEqual(
    summary.rows.map((r) => r.key),
    ["2", "1"],
  );
});

test("subjects with no questions are separated out as gaps", () => {
  const summary = summariseSubjects([
    { id: "1", name: "Maths", code: "MTH", questionCount: 5 },
    { id: "2", name: "Civic Education", code: "CIV", questionCount: 0 },
  ]);
  assert.deepEqual(summary.empty.map((s) => s.code), ["CIV"]);
  assert.deepEqual(summary.rows.map((r) => r.key), ["1"]);
  assert.equal(summary.total, 5);
});

test("the total is the sum of every subject's questions", () => {
  const summary = summariseSubjects([
    { id: "1", name: "Maths", code: "MTH", questionCount: 5 },
    { id: "2", name: "Physics", code: "PHY", questionCount: 7 },
  ]);
  assert.equal(summary.total, 12);
});
