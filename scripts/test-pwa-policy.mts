import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";

// The policy ships as a classic script so the service worker can pull it in
// with importScripts(); a module worker would exclude older Android Chrome
// and Safari. node:vm is how a classic script gets exercised from a test.
const source = readFileSync(
  new URL("../public/sw-policy.js", import.meta.url),
  "utf8",
);
const context: Record<string, unknown> = createContext({ URL });
runInContext(source, context);

const chooseStrategy = context.chooseStrategy as (
  url: string,
  method: string,
  origin: string,
) => string;

const ORIGIN = "https://scholarscrib.com";
const strategy = (path: string, method = "GET") =>
  chooseStrategy(`${ORIGIN}${path}`, method, ORIGIN);

test("hashed build output is cache-first", () => {
  assert.equal(strategy("/_next/static/chunks/main-abc123.js"), "cache-first");
  assert.equal(strategy("/_next/static/css/app-def456.css"), "cache-first");
});

test("stable branding assets are cache-first", () => {
  assert.equal(strategy("/icon-192.png"), "cache-first");
  assert.equal(strategy("/icon-512-maskable.png"), "cache-first");
  assert.equal(strategy("/logo-on-light.png"), "cache-first");
  assert.equal(strategy("/favicon.ico"), "cache-first");
});

test("heavy media is stale-while-revalidate", () => {
  assert.equal(
    strategy("/_next/image?url=%2Fquestions%2Fa.png&w=640&q=75"),
    "stale-while-revalidate",
  );
  assert.equal(strategy("/questions/waec-2019-bio-3.png"), "stale-while-revalidate");
  assert.equal(strategy("/resources/mole-concept.pdf"), "stale-while-revalidate");
});

test("public pages are network-first", () => {
  assert.equal(strategy("/"), "network-first");
  assert.equal(strategy("/about"), "network-first");
  assert.equal(strategy("/contact"), "network-first");
  assert.equal(strategy("/learn"), "network-first");
  assert.equal(strategy("/learn/biology/cell-structure"), "network-first");
  assert.equal(strategy("/past-questions/waec/biology/2019"), "network-first");
  assert.equal(strategy("/offline"), "network-first");
});

test("a trailing slash does not change the decision", () => {
  assert.equal(strategy("/learn/"), "network-first");
  assert.equal(strategy("/past-questions/waec/"), "network-first");
});

test("prefix matching is segment-aware", () => {
  // The trap isPublicPath already guards: "/learnable" is not inside "/learn".
  assert.equal(strategy("/learnable"), "network-only");
  assert.equal(strategy("/past-questions-archive"), "network-only");
});

test("authenticated pages are never cached", () => {
  // A cached page keyed to one student, served to whoever picks up the shared
  // phone next, is a cross-account leak. This is the whole constraint.
  assert.equal(strategy("/dashboard"), "network-only");
  assert.equal(strategy("/settings/billing"), "network-only");
  assert.equal(strategy("/classroom/biology/cell-structure"), "network-only");
  assert.equal(strategy("/flashcards"), "network-only");
  assert.equal(strategy("/library"), "network-only");
  assert.equal(strategy("/performance"), "network-only");
  assert.equal(strategy("/study-plan"), "network-only");
  assert.equal(strategy("/achievements"), "network-only");
});

test("exam routes are network-only", () => {
  assert.equal(strategy("/practice"), "network-only");
  assert.equal(strategy("/practice/past-questions"), "network-only");
  assert.equal(strategy("/practice/exam/cmx123"), "network-only");
});

test("api and admin are network-only", () => {
  assert.equal(strategy("/api/questions"), "network-only");
  assert.equal(strategy("/api/auth/session"), "network-only");
  assert.equal(strategy("/admin"), "network-only");
  assert.equal(strategy("/admin/students"), "network-only");
});

test("no method other than GET is ever cached", () => {
  for (const method of ["POST", "PUT", "PATCH", "DELETE", "HEAD"]) {
    assert.equal(strategy("/", method), "network-only");
    assert.equal(strategy("/learn/biology", method), "network-only");
    assert.equal(strategy("/_next/static/chunks/main-abc123.js", method), "network-only");
  }
});

test("cross-origin requests are left alone", () => {
  assert.equal(
    chooseStrategy("https://res.cloudinary.com/x/avatar.png", "GET", ORIGIN),
    "network-only",
  );
  assert.equal(
    chooseStrategy("https://api.paystack.co/transaction", "GET", ORIGIN),
    "network-only",
  );
});

test("an unparseable url falls back to network-only", () => {
  assert.equal(chooseStrategy("not a url", "GET", ORIGIN), "network-only");
});

test("the service worker files are never cached by the worker itself", () => {
  // They are served no-store; caching them is how a PWA becomes unfixable.
  assert.equal(strategy("/sw.js"), "network-only");
  assert.equal(strategy("/sw-policy.js"), "network-only");
});
