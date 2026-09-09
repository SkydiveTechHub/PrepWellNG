import { test } from "node:test";
import assert from "node:assert/strict";
import { isPublicPath } from "../src/lib/public-routes";

test("the marketing page is public", () => {
  assert.equal(isPublicPath("/"), true);
});

test("the learn tree is public at every depth", () => {
  assert.equal(isPublicPath("/learn"), true);
  assert.equal(isPublicPath("/learn/biology"), true);
  assert.equal(isPublicPath("/learn/biology/cell-structure"), true);
});

test("the past-questions tree is public at every depth", () => {
  assert.equal(isPublicPath("/past-questions"), true);
  assert.equal(isPublicPath("/past-questions/waec"), true);
  assert.equal(isPublicPath("/past-questions/waec/biology"), true);
  assert.equal(isPublicPath("/past-questions/waec/biology/2019"), true);
});

test("crawler-facing metadata files are public", () => {
  // A crawler fetches these before anything else. Redirecting robots.txt to a
  // login page is indistinguishable, to Google, from having no robots.txt.
  assert.equal(isPublicPath("/robots.txt"), true);
  assert.equal(isPublicPath("/sitemap.xml"), true);
  assert.equal(isPublicPath("/sitemap/static.xml"), true);
  assert.equal(isPublicPath("/sitemap/learn.xml"), true);
  assert.equal(isPublicPath("/sitemap/past-questions.xml"), true);
  assert.equal(isPublicPath("/manifest.webmanifest"), true);
});

test("the root open-graph image is public", () => {
  // Social scrapers are anonymous too, and a redirected OG image renders as a
  // broken preview card.
  assert.equal(isPublicPath("/opengraph-image"), true);
  assert.equal(isPublicPath("/opengraph-image.png"), true);
  assert.equal(isPublicPath("/opengraph-image-a1b2c3.png"), true);
});

test("open-graph images inside the public tree are public", () => {
  assert.equal(
    isPublicPath("/learn/biology/cell-structure/opengraph-image.png"),
    true,
  );
  assert.equal(
    isPublicPath("/past-questions/waec/biology/2019/opengraph-image.png"),
    true,
  );
});

test("a trailing slash does not change the verdict", () => {
  assert.equal(isPublicPath("/learn/"), true);
  assert.equal(isPublicPath("/past-questions/"), true);
  assert.equal(isPublicPath("/dashboard/"), false);
});

test("EVERY gated tree stays closed", () => {
  // This is the assertion that matters. If any of these flips to true, an
  // authenticated area has become anonymously readable.
  for (const path of [
    "/dashboard",
    "/dashboard/anything",
    "/classroom",
    "/classroom/biology/cell-structure",
    "/practice",
    "/practice/past-questions",
    "/practice/cbt/session",
    "/flashcards",
    "/flashcards/deck-1",
    "/performance",
    "/study-plan",
    "/achievements",
    "/library",
    "/settings",
    "/settings/billing",
    "/admin",
    "/admin/questions",
    "/admin/api/students",
    "/api/assessments/submit",
    "/api/billing/checkout",
  ]) {
    assert.equal(isPublicPath(path), false, `${path} must NOT be public`);
  }
});

test("a path is not public merely because it resembles a public prefix", () => {
  // "/learnable" is not inside "/learn".
  assert.equal(isPublicPath("/learnable"), false);
  assert.equal(isPublicPath("/learn-more"), false);
  assert.equal(isPublicPath("/past-questions-archive"), false);
  assert.equal(isPublicPath("/sitemapper"), false);
  assert.equal(isPublicPath("/robots.txt.bak"), false);
});

test("an opengraph-image segment cannot smuggle a gated path open", () => {
  // The OG rule must be anchored, or "/dashboard/opengraph-image.png" — and by
  // extension anything an attacker appends that segment to — would open up.
  assert.equal(isPublicPath("/dashboard/opengraph-image.png"), false);
  assert.equal(isPublicPath("/admin/opengraph-image.png"), false);
  assert.equal(isPublicPath("/settings/billing/opengraph-image.png"), false);
});

test("empty and malformed input is not public", () => {
  assert.equal(isPublicPath(""), false);
  assert.equal(isPublicPath("learn"), false);
  assert.equal(isPublicPath("//evil.com"), false);
});
