import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSlots, dayBudget } from "../src/engines/planner/slots";

// 2026-09-14 is a Monday.
const availability = { studyDays: [1, 2, 3, 4, 6], weekdayMinutes: 45, weekendMinutes: 120 };

test("dayBudget uses the weekday or weekend figure, zero on rest days", () => {
  assert.equal(dayBudget("2026-09-14", availability), 45);
  assert.equal(dayBudget("2026-09-19", availability), 120);
  assert.equal(dayBudget("2026-09-18", availability), 0); // Friday not chosen
  assert.equal(dayBudget("2026-09-20", availability), 0); // Sunday not chosen
});

test("a 45 minute day is one full session plus one short session", () => {
  const monday = buildSlots("2026-09-14", 1, availability);
  assert.deepEqual(
    monday.map((s) => [s.minutes, s.short]),
    [[30, false], [15, true]],
  );
});

test("remainders under 15 minutes are dropped", () => {
  const slots = buildSlots("2026-09-14", 1, { studyDays: [1], weekdayMinutes: 40, weekendMinutes: 0 });
  assert.deepEqual(slots.map((s) => s.minutes), [30]);
});

test("a day's slots never exceed its budget", () => {
  const slots = buildSlots("2026-09-14", 14, availability);
  const perDay = new Map<string, number>();
  for (const s of slots) perDay.set(s.date, (perDay.get(s.date) ?? 0) + s.minutes);
  for (const [date, minutes] of perDay) {
    assert.ok(minutes <= dayBudget(date, availability), date);
  }
});

test("the catch-up slot is the first full slot of each week's last study day", () => {
  const slots = buildSlots("2026-09-14", 14, availability);
  const catchUps = slots.filter((s) => s.catchUp);
  assert.deepEqual(catchUps.map((s) => s.date), ["2026-09-19", "2026-09-26"]);
  const saturday = slots.filter((s) => s.date === "2026-09-19");
  assert.equal(saturday[0].catchUp, true);
  assert.equal(saturday.slice(1).some((s) => s.catchUp), false);
});
