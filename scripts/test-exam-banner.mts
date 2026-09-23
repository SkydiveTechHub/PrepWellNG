import { test } from "node:test";
import assert from "node:assert/strict";
import { examBannerFor } from "../src/engines/planner/exam-banner";

const TODAY = "2026-09-19";

/** `targetDate` is read back from Prisma as UTC midnight. */
function on(day: string) {
  return new Date(`${day}T00:00:00Z`);
}

test("no plan means no banner", () => {
  assert.equal(examBannerFor({ plan: null, classLevel: "SS3", today: TODAY }), null);
});

test("a plan with no exam date means no banner", () => {
  assert.equal(
    examBannerFor({
      plan: { targetExam: null, targetDate: null },
      classLevel: "SS3",
      today: TODAY,
    }),
    null,
  );
});

test("a sitting that has already passed means no banner", () => {
  assert.equal(
    examBannerFor({
      plan: { targetExam: "WAEC", targetDate: on("2026-05-03") },
      classLevel: "SS3",
      today: TODAY,
    }),
    null,
  );
});

test("exam dates are an SS3 affair — SS2 gets no banner", () => {
  assert.equal(
    examBannerFor({
      plan: { targetExam: "WAEC", targetDate: on("2027-05-03") },
      classLevel: "SS2",
      today: TODAY,
    }),
    null,
  );
});

test("an unknown class level gets no banner", () => {
  assert.equal(
    examBannerFor({
      plan: { targetExam: "WAEC", targetDate: on("2027-05-03") },
      classLevel: null,
      today: TODAY,
    }),
    null,
  );
});

test("an SS3 plan with a future sitting gets the plan's own board and year", () => {
  const banner = examBannerFor({
    plan: { targetExam: "JAMB", targetDate: on("2027-04-12") },
    classLevel: "SS3",
    today: TODAY,
  });
  assert.equal(banner?.label, "JAMB 2027");
});

test("the countdown is whole days to the sitting", () => {
  const banner = examBannerFor({
    plan: { targetExam: "WAEC", targetDate: on("2026-09-29") },
    classLevel: "SS3",
    today: TODAY,
  });
  assert.equal(banner?.daysToExam, 10);
});

test("the sitting itself counts as zero days, not a negative", () => {
  const banner = examBannerFor({
    plan: { targetExam: "WAEC", targetDate: on(TODAY) },
    classLevel: "SS3",
    today: TODAY,
  });
  assert.equal(banner?.daysToExam, 0);
});
