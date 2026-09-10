import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSitemap } from "../src/lib/seo/sitemap-shape";
import { siteUrl } from "../src/lib/seo/site";

test("entries become absolute urls", () => {
  const [entry] = buildSitemap([{ path: "/learn/biology" }]);
  assert.equal(entry.url, `${siteUrl}/learn/biology`);
});

test("a gated path is dropped rather than published", () => {
  // The single most damaging sitemap bug: advertising URLs that answer with a
  // login redirect.
  const entries = buildSitemap([
    { path: "/learn/biology" },
    { path: "/dashboard" },
    { path: "/practice/past-questions" },
    { path: "/api/health" },
  ]);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].url, `${siteUrl}/learn/biology`);
});

test("a duplicate url appears once", () => {
  const entries = buildSitemap([
    { path: "/learn/biology" },
    { path: "/learn/biology/" },
    { path: "learn/biology" },
  ]);
  assert.equal(entries.length, 1);
});

test("lastModified is omitted, never invented, when there is no timestamp", () => {
  // Stamping new Date() on every entry tells crawlers the whole site changed
  // on every build, which trains them to ignore the field.
  const [absent] = buildSitemap([{ path: "/learn/biology", lastModified: null }]);
  assert.ok(!("lastModified" in absent), JSON.stringify(absent));

  const [undef] = buildSitemap([{ path: "/learn/chemistry" }]);
  assert.ok(!("lastModified" in undef), JSON.stringify(undef));
});

test("a real timestamp is carried through", () => {
  const when = new Date("2026-01-02T03:04:05.000Z");
  const [entry] = buildSitemap([{ path: "/learn/biology", lastModified: when }]);
  assert.equal(entry.lastModified, when);
});

test("the newer of two duplicate timestamps wins", () => {
  const older = new Date("2025-01-01T00:00:00.000Z");
  const newer = new Date("2026-01-01T00:00:00.000Z");
  const entries = buildSitemap([
    { path: "/learn/biology", lastModified: older },
    { path: "/learn/biology", lastModified: newer },
  ]);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].lastModified, newer);
});
