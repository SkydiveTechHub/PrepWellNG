import { test } from "node:test";
import assert from "node:assert/strict";
import { GATED_PATH_PREFIXES, SITEMAP_SHARDS, isGatedPath } from "../src/lib/seo/paths";

test("every gated segment and its descendants are gated", () => {
  for (const prefix of GATED_PATH_PREFIXES) {
    assert.equal(isGatedPath(prefix), true, `${prefix} should be gated`);
    assert.equal(isGatedPath(`${prefix}/deeper`), true, `${prefix}/deeper should be gated`);
  }
});

test("the public surface is not gated", () => {
  for (const path of [
    "/",
    "/learn",
    "/learn/biology",
    "/learn/biology/cell-structure",
    "/past-questions",
    "/past-questions/waec",
    "/past-questions/waec/biology/2019",
  ]) {
    assert.equal(isGatedPath(path), false, `${path} should be public`);
  }
});

test("a public path is not gated by a prefix it merely resembles", () => {
  // "/past-questions" shares no prefix with "/practice", but a naive
  // startsWith over bare strings would gate "/librarian" under "/library".
  assert.equal(isGatedPath("/practice-tips"), false);
  assert.equal(isGatedPath("/librarian"), false);
  assert.equal(isGatedPath("/settings-guide"), false);
});

test("the sitemap shard names are fixed", () => {
  // robots.ts names one sitemap URL per shard, so the list has to live beside
  // the gated paths rather than in the sitemap module Task 19 adds later.
  assert.deepEqual(SITEMAP_SHARDS, ["static", "learn", "past-questions"]);
});

test("the list covers the routes that actually exist behind auth", () => {
  for (const prefix of [
    "/api", "/admin", "/dashboard", "/classroom", "/practice", "/flashcards",
    "/performance", "/study-plan", "/achievements", "/library", "/settings",
    "/login", "/register",
  ]) {
    assert.ok(
      GATED_PATH_PREFIXES.includes(prefix),
      `${prefix} is missing from GATED_PATH_PREFIXES`,
    );
  }
});

test("the gated list is exactly these 13 entries, no more, no fewer", () => {
  // The membership check above catches a removed entry but not a stray added
  // one — an entry added here without also being added to the "actually
  // exist behind auth" list above would slip through unnoticed even though
  // this list gates a security-relevant surface. Pin the exact set.
  assert.deepEqual(GATED_PATH_PREFIXES, [
    "/api", "/admin", "/dashboard", "/classroom", "/practice", "/flashcards",
    "/performance", "/study-plan", "/achievements", "/library", "/settings",
    "/login", "/register",
  ]);
});
