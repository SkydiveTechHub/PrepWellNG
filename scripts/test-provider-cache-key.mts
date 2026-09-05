import { test } from "node:test";
import assert from "node:assert/strict";
import { cacheKey } from "../src/lib/question-provider/cache-key";

test("a filter serialises to a stable canonical key", () => {
  assert.equal(
    cacheKey({ subjectSlug: "chemistry", examType: "JAMB", examYear: 2022 }),
    "chemistry|JAMB|2022",
  );
});

test("casing and surrounding whitespace do not create a second key", () => {
  const a = cacheKey({ subjectSlug: "chemistry", examType: "JAMB", examYear: 2022 });
  const b = cacheKey({ subjectSlug: " Chemistry ", examType: "JAMB", examYear: 2022 });
  assert.equal(a, b);
});

test("different years never collide", () => {
  const a = cacheKey({ subjectSlug: "chemistry", examType: "JAMB", examYear: 2022 });
  const b = cacheKey({ subjectSlug: "chemistry", examType: "JAMB", examYear: 2021 });
  assert.notEqual(a, b);
});

test("different exam types never collide", () => {
  const a = cacheKey({ subjectSlug: "biology", examType: "WAEC", examYear: 2018 });
  const b = cacheKey({ subjectSlug: "biology", examType: "NECO", examYear: 2018 });
  assert.notEqual(a, b);
});

test("a subject whose name contains the separator cannot forge another key", () => {
  // Guards against "a|B" + "C" colliding with "a" + "B|C".
  const a = cacheKey({ subjectSlug: "chemistry|JAMB", examType: "NECO", examYear: 2022 });
  const b = cacheKey({ subjectSlug: "chemistry", examType: "JAMB", examYear: 2022 });
  assert.notEqual(a, b);
});
