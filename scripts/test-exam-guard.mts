import { test } from "node:test";
import assert from "node:assert/strict";
import {
  guardedDestination,
  type NavigationIntent,
} from "../src/components/assessment/exam-guard";

const EXAM_URL = "https://prepwell.ng/practice/mock-exam/session";

function intent(overrides: Partial<NavigationIntent> = {}): NavigationIntent {
  return {
    href: "https://prepwell.ng/dashboard",
    currentUrl: EXAM_URL,
    target: null,
    download: false,
    modified: false,
    defaultPrevented: false,
    ...overrides,
  };
}

test("guards an in-app link to another route", () => {
  assert.equal(guardedDestination(intent()), "/dashboard");
});

test("keeps the query and hash of the destination", () => {
  const href = "https://prepwell.ng/classroom/physics?tab=lessons#waves";
  assert.equal(
    guardedDestination(intent({ href })),
    "/classroom/physics?tab=lessons#waves",
  );
});

test("resolves a relative href against the exam URL", () => {
  assert.equal(guardedDestination(intent({ href: "/library" })), "/library");
});

test("ignores an anchor with no href", () => {
  assert.equal(guardedDestination(intent({ href: null })), null);
});

test("ignores a link to another origin", () => {
  assert.equal(
    guardedDestination(intent({ href: "https://jamb.gov.ng/results" })),
    null,
  );
});

test("ignores a link that opens in a new tab", () => {
  assert.equal(guardedDestination(intent({ target: "_blank" })), null);
});

test("guards a link that explicitly targets the same tab", () => {
  assert.equal(guardedDestination(intent({ target: "_self" })), "/dashboard");
});

test("ignores a download link", () => {
  assert.equal(guardedDestination(intent({ download: true })), null);
});

test("ignores a modified click, which opens a new tab or window", () => {
  assert.equal(guardedDestination(intent({ modified: true })), null);
});

test("ignores a click another handler has already cancelled", () => {
  assert.equal(guardedDestination(intent({ defaultPrevented: true })), null);
});

test("ignores a link back to the exam the student is already on", () => {
  assert.equal(guardedDestination(intent({ href: EXAM_URL })), null);
});

test("ignores a hash-only link, which stays on the exam page", () => {
  assert.equal(
    guardedDestination(intent({ href: `${EXAM_URL}#question-12` })),
    null,
  );
});

test("guards a link to the same path with a different query", () => {
  assert.equal(
    guardedDestination(intent({ href: `${EXAM_URL}?subject=physics` })),
    "/practice/mock-exam/session?subject=physics",
  );
});

test("ignores a mailto link, which never leaves the page", () => {
  assert.equal(
    guardedDestination(intent({ href: "mailto:help@prepwell.ng" })),
    null,
  );
});

test("ignores a tel link, which never leaves the page", () => {
  assert.equal(guardedDestination(intent({ href: "tel:+2348012345678" })), null);
});

test("ignores an href the URL parser cannot make sense of", () => {
  assert.equal(guardedDestination(intent({ href: "http://" })), null);
});
