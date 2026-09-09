import { test } from "node:test";
import assert from "node:assert/strict";
import { absoluteUrl, normaliseSiteUrl, siteUrl } from "../src/lib/seo/site";
import { buildMetadata, NOINDEX } from "../src/lib/seo/metadata";

test("an unset or blank app url falls back to production", () => {
  assert.equal(normaliseSiteUrl(undefined), "https://prepwell.ng");
  assert.equal(normaliseSiteUrl(""), "https://prepwell.ng");
  assert.equal(normaliseSiteUrl("   "), "https://prepwell.ng");
});

test("garbage in the env var does not produce a garbage canonical", () => {
  // A broken canonical is worse than a wrong-but-valid one: crawlers drop the
  // page entirely rather than guessing what was meant.
  assert.equal(normaliseSiteUrl("not a url"), "https://prepwell.ng");
});

test("path, trailing slash and query are stripped from the host", () => {
  assert.equal(normaliseSiteUrl("https://prepwell.ng/"), "https://prepwell.ng");
  assert.equal(normaliseSiteUrl("http://localhost:3000/"), "http://localhost:3000");
  assert.equal(normaliseSiteUrl("https://prepwell.ng/app?x=1"), "https://prepwell.ng");
});

test("non-http(s) schemes fall back to production instead of becoming the canonical host", () => {
  // These are parseable by URL, just not valid as a site origin: a canonical
  // built on javascript:/file:/data: is worse than one that fell back.
  assert.equal(normaliseSiteUrl("javascript:alert(1)"), "https://prepwell.ng");
  assert.equal(normaliseSiteUrl("file:///etc/passwd"), "https://prepwell.ng");
  assert.equal(normaliseSiteUrl("data:text/html,hi"), "https://prepwell.ng");
});

test("protocol-relative input has no base to resolve against, so it falls back", () => {
  assert.equal(normaliseSiteUrl("//evil.com"), "https://prepwell.ng");
});

test("credentials are stripped and the port is retained", () => {
  assert.equal(
    normaliseSiteUrl("https://user:pass@example.com:8080"),
    "https://example.com:8080",
  );
});

test("absoluteUrl normalises the join from either side", () => {
  assert.equal(absoluteUrl("learn"), `${siteUrl}/learn`);
  assert.equal(absoluteUrl("/learn"), `${siteUrl}/learn`);
  assert.equal(absoluteUrl("/learn/"), `${siteUrl}/learn`);
});

test("the home page canonical keeps its single trailing slash", () => {
  // Root is the one path where the trailing slash is canonical, and "" would
  // emit a bare origin that some crawlers treat as a different URL.
  assert.equal(absoluteUrl("/"), `${siteUrl}/`);
  assert.equal(absoluteUrl(""), `${siteUrl}/`);
});

test("an already-absolute image url is passed through untouched", () => {
  const meta = buildMetadata({
    title: "T",
    description: "D",
    path: "/learn",
    image: "https://res.cloudinary.com/demo/og.png",
  });
  assert.deepEqual(meta.openGraph?.images, [
    { url: "https://res.cloudinary.com/demo/og.png" },
  ]);
});

test("canonical, open graph and twitter all describe the same url", () => {
  const meta = buildMetadata({ title: "T", description: "D", path: "/learn/biology" });
  const canonical = `${siteUrl}/learn/biology`;
  assert.equal(meta.alternates?.canonical, canonical);
  assert.equal(meta.openGraph?.url, canonical);
  assert.equal(meta.title, "T");
  assert.equal(meta.openGraph?.title, "T");
  assert.equal(meta.twitter?.title, "T");
  assert.equal(meta.description, "D");
  assert.equal(meta.openGraph?.description, "D");
  assert.equal(meta.twitter?.description, "D");
});

test("open graph carries the Nigerian locale and the site name", () => {
  const meta = buildMetadata({ title: "T", description: "D", path: "/" });
  assert.equal(meta.openGraph?.locale, "en_NG");
  assert.equal(meta.openGraph?.siteName, "PrepWell NG");
});

test("robots is left alone unless noindex is asked for", () => {
  assert.equal(buildMetadata({ title: "T", description: "D", path: "/" }).robots, undefined);
  const hidden = buildMetadata({ title: "T", description: "D", path: "/x", noindex: true });
  assert.deepEqual(hidden.robots, { index: false, follow: false });
});

test("the shared noindex constant blocks both indexing and link following", () => {
  assert.deepEqual(NOINDEX.robots, { index: false, follow: false });
});
