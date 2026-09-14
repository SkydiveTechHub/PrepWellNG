import { test } from "node:test";
import assert from "node:assert/strict";
import {
  audienceClauses,
  audienceFilterSchema,
  describeAudience,
  matchesAudience,
  parseStoredAudience,
  type AudienceFilter,
  type AudienceStudent,
} from "../src/lib/push-audience";
import { audienceWhereSql } from "../src/lib/push-audience-sql";

const student = (patch: Partial<AudienceStudent> = {}): AudienceStudent => ({
  id: "u1",
  role: "STUDENT",
  isActive: true,
  classLevel: "SS3",
  track: "SCIENCE",
  tier: "STANDARD",
  activeExamTargets: ["JAMB"],
  ...patch,
});

const FIXTURES: { name: string; filter: AudienceFilter; matches: AudienceStudent[]; misses: AudienceStudent[] }[] = [
  { name: "empty = every active student", filter: {}, matches: [student(), student({ classLevel: null, track: null, activeExamTargets: [] })], misses: [student({ role: "TEACHER" }), student({ isActive: false })] },
  { name: "class level", filter: { classLevels: ["SS2", "SS3"] }, matches: [student()], misses: [student({ classLevel: "SS1" }), student({ classLevel: null })] },
  { name: "track", filter: { tracks: ["ARTS"] }, matches: [student({ track: "ARTS" })], misses: [student(), student({ track: null })] },
  { name: "tier", filter: { tiers: ["FREEMIUM"] }, matches: [student({ tier: "FREEMIUM" })], misses: [student()] },
  { name: "exam target via active plan", filter: { examTargets: ["JAMB"] }, matches: [student(), student({ activeExamTargets: ["WAEC", "JAMB"] })], misses: [student({ activeExamTargets: [] }), student({ activeExamTargets: ["WAEC"] })] },
  { name: "user ids", filter: { userIds: ["u1", "u9"] }, matches: [student()], misses: [student({ id: "u2" })] },
  { name: "fields combine with AND", filter: { classLevels: ["SS3"], tiers: ["PREMIUM"] }, matches: [student({ tier: "PREMIUM" })], misses: [student(), student({ classLevel: "SS2", tier: "PREMIUM" })] },
];

for (const fixture of FIXTURES) {
  test(`matchesAudience: ${fixture.name}`, () => {
    for (const s of fixture.matches) assert.equal(matchesAudience(s, fixture.filter), true, JSON.stringify(s));
    for (const s of fixture.misses) assert.equal(matchesAudience(s, fixture.filter), false, JSON.stringify(s));
  });
}

test("clauses skip empty lists and de-duplicate values", () => {
  assert.deepEqual(audienceClauses({ classLevels: [], tiers: ["PREMIUM", "PREMIUM"] }), [
    { field: "tier", values: ["PREMIUM"] },
  ]);
});

test("the SQL predicate has one parameterised condition per clause with the same values", () => {
  for (const fixture of FIXTURES) {
    const sql = audienceWhereSql(fixture.filter);
    const clauses = audienceClauses(fixture.filter);
    // Base conditions: role and isActive. Plus one IN (...) per clause.
    assert.equal((sql.sql.match(/ IN \(/g) ?? []).length, clauses.length, fixture.name);
    assert.deepEqual(
      sql.values,
      ["STUDENT", ...clauses.flatMap((c) => c.values)],
      fixture.name,
    );
    assert.ok(!/SS\d|JAMB|PREMIUM|u1/.test(sql.sql), "values must be parameters, never inlined");
  }
});

test("schema rejects unknown values and keys", () => {
  assert.equal(audienceFilterSchema.safeParse({ classLevels: ["SS4"] }).success, false);
  assert.equal(audienceFilterSchema.safeParse({ examTargets: ["CUSTOM"] }).success, false);
  assert.equal(audienceFilterSchema.safeParse({ schools: ["x"] }).success, false);
  assert.equal(audienceFilterSchema.safeParse({}).success, true);
});

test("stored JSON is re-validated", () => {
  assert.deepEqual(parseStoredAudience({ tiers: ["FREEMIUM"] }), { tiers: ["FREEMIUM"] });
  assert.equal(parseStoredAudience({ tiers: ["GOLD"] }), null);
  assert.equal(parseStoredAudience("nope"), null);
});

test("descriptions", () => {
  assert.equal(describeAudience({}), "All students");
  assert.equal(describeAudience({ classLevels: ["SS3"], examTargets: ["JAMB"] }), "JAMB plan · SS3");
  assert.equal(describeAudience({ userIds: ["a", "b"] }), "2 specific students");
});
