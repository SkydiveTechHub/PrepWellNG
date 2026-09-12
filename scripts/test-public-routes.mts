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

test("there is no twitter-image route, so it is not allowlisted", () => {
  // No twitter-image.tsx exists anywhere in the app (only opengraph-image.tsx
  // files) — a "twitter-image" entry in this auth allowlist would be dead and
  // 404 if followed. An auth allowlist should not carry entries pointing at
  // nothing.
  assert.equal(isPublicPath("/twitter-image"), false);
  assert.equal(isPublicPath("/twitter-image.png"), false);
  assert.equal(isPublicPath("/twitter-image-a1b2c3.png"), false);
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

test("the about and contact pages are public", () => {
  // Both are linked from the footer of every page and listed in the sitemap.
  // Left off this allowlist they 307 to /login, which reads to a crawler as
  // the pages not existing — and to a student with a billing problem as a
  // support route that does not work.
  assert.equal(isPublicPath("/about"), true);
  assert.equal(isPublicPath("/contact"), true);
});

test("a path that merely starts with about or contact stays gated", () => {
  // These are exact entries, not prefixes: nothing should be able to hide a
  // gated tree behind "/contacts/..." or "/about-us/...".
  assert.equal(isPublicPath("/aboutus"), false);
  assert.equal(isPublicPath("/about/team"), false);
  assert.equal(isPublicPath("/contacts"), false);
  assert.equal(isPublicPath("/contact/admin"), false);
});

test("the PWA runtime files are public", () => {
  // The service worker registration is an anonymous fetch — the browser does
  // not attach the session to it in a way the proxy honours. A 307 to /login
  // here means the worker never installs and the failure is silent.
  assert.equal(isPublicPath("/sw.js"), true);
  assert.equal(isPublicPath("/sw-policy.js"), true);
});

test("the offline fallback is public", () => {
  // It is precached and shown precisely when the app cannot reach the server,
  // so it can never be behind a redirect that needs the server.
  assert.equal(isPublicPath("/offline"), true);
});

test("opening the PWA surface did not open anything else", () => {
  assert.equal(isPublicPath("/dashboard"), false);
  assert.equal(isPublicPath("/practice"), false);
  assert.equal(isPublicPath("/admin"), false);
  assert.equal(isPublicPath("/api/questions"), false);
  // Not an "/offline" prefix — only the exact path is public.
  assert.equal(isPublicPath("/offline-report"), false);
  // Not a ".js" rule — only these two files.
  assert.equal(isPublicPath("/admin/sw.js"), false);
});
