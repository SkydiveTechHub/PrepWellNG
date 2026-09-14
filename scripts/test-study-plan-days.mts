import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addDays,
  dateToDayKey,
  dayKeyToDate,
  daysBetween,
  isoWeekday,
  isWeekend,
  mondayOf,
} from "../src/engines/planner/days";

test("addDays crosses month and year boundaries", () => {
  assert.equal(addDays("2026-09-30", 1), "2026-10-01");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
});

test("daysBetween is signed", () => {
  assert.equal(daysBetween("2026-09-14", "2026-09-28"), 14);
  assert.equal(daysBetween("2026-09-28", "2026-09-14"), -14);
});

test("isoWeekday numbers Monday 1 and Sunday 7", () => {
  assert.equal(isoWeekday("2026-09-14"), 1);
  assert.equal(isoWeekday("2026-09-19"), 6);
  assert.equal(isoWeekday("2026-09-20"), 7);
  assert.equal(isWeekend("2026-09-19"), true);
  assert.equal(isWeekend("2026-09-18"), false);
});

test("mondayOf returns the same week's Monday", () => {
  assert.equal(mondayOf("2026-09-20"), "2026-09-14");
  assert.equal(mondayOf("2026-09-14"), "2026-09-14");
});

test("day keys round-trip through @db.Date values", () => {
  const date = dayKeyToDate("2026-09-14");
  assert.equal(date.toISOString(), "2026-09-14T00:00:00.000Z");
  assert.equal(dateToDayKey(date), "2026-09-14");
});
