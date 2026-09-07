import { test } from "node:test";
import assert from "node:assert/strict";
import { EXAM_YEAR_FLOOR, examYearRange } from "../src/lib/exam-years";

const IN_2026 = new Date("2026-09-06T09:00:00+01:00");

test("spans the floor up to the current year, newest first", () => {
  const years = examYearRange([], IN_2026);
  assert.equal(years[0], 2026);
  assert.equal(years.at(-1), EXAM_YEAR_FLOOR);
  assert.equal(years.length, 2026 - EXAM_YEAR_FLOOR + 1);
});

test("stretches down for a paper older than the floor", () => {
  const years = examYearRange([1998, 2015], IN_2026);
  assert.equal(years.at(-1), 1998);
  assert.equal(years[0], 2026);
});

test("stretches up for a paper newer than this year", () => {
  assert.equal(examYearRange([2027], IN_2026)[0], 2027);
});

test("known years inside the range add nothing", () => {
  assert.deepEqual(examYearRange([2015, 2020], IN_2026), examYearRange([], IN_2026));
});

test("ignores nulls and nonsense years", () => {
  const years = examYearRange([null, undefined, 0, NaN, 2011], IN_2026);
  assert.deepEqual(years, examYearRange([], IN_2026));
});

test("descends without gaps or repeats", () => {
  const years = examYearRange([1999], IN_2026);
  assert.equal(new Set(years).size, years.length);
  for (let i = 1; i < years.length; i++) {
    assert.equal(years[i], years[i - 1] - 1);
  }
});

test("the floor is the year the modern past-paper record starts", () => {
  assert.equal(EXAM_YEAR_FLOOR, 2000);
});
