import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import * as mod from "../src/app/manifest";

// A probe showed this module's default export arrives doubly nested
// (m.default.default) instead of as the function itself when run the way
// `npm test` actually runs it — `node --import tsx --test`. (Invoking the tsx
// CLI binary directly does not wrap it, which is why a plain default import
// looks fine there and only breaks under CI's real invocation.) Resolve
// whichever shape we actually got rather than bending src/app/manifest.ts to
// suit the test harness.
type ManifestFn = () => import("next").MetadataRoute.Manifest;
const candidate: unknown = (mod as { default: unknown }).default;
const manifestFn: ManifestFn =
  typeof candidate === "function"
    ? (candidate as ManifestFn)
    : ((candidate as { default: unknown })?.default as ManifestFn);

const result = manifestFn();

test("the manifest declares an identity and a scope", () => {
  assert.equal(result.id, "/");
  assert.equal(result.scope, "/");
  assert.equal(result.display, "standalone");
});

test("start_url lands inside scope", () => {
  const start = new URL(result.start_url!, "https://scholarscrib.com");
  assert.ok(
    start.pathname.startsWith(result.scope!),
    `start_url ${result.start_url} is outside scope ${result.scope}`,
  );
});

test("start_url opens the app, not the marketing page", () => {
  // An installed app that opens on the landing page reads as a bookmark.
  assert.match(result.start_url!, /^\/dashboard/);
});

test("both installability sizes exist in both purposes", () => {
  const icons = result.icons ?? [];
  for (const size of ["192x192", "512x512"]) {
    for (const purpose of ["any", "maskable"]) {
      assert.ok(
        icons.some((icon) => icon.sizes === size && icon.purpose === purpose),
        `missing a ${size} icon with purpose "${purpose}"`,
      );
    }
  }
});

test("every icon file the manifest names actually exists", () => {
  // Chrome fails the whole installability check on one 404 icon, and it
  // reports it only in DevTools where nobody is looking.
  for (const icon of result.icons ?? []) {
    if (icon.src.startsWith("http")) continue;
    assert.ok(
      existsSync(new URL(`../public${icon.src}`, import.meta.url)) ||
        existsSync(new URL(`../src/app${icon.src}`, import.meta.url)),
      `manifest references ${icon.src}, which is not on disk`,
    );
  }
});

test("the splash background matches the app background token", () => {
  // --app-background in globals.css. A #ffffff here flashes white before the
  // first paint of a #f8fafc app.
  assert.equal(result.background_color, "#f8fafc");
});
