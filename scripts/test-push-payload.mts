import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BODY_MAX,
  TITLE_MAX,
  buildPushPayload,
  isInternalPath,
  pushTag,
  truncate,
} from "../src/lib/push-payload";

test("internal paths are accepted", () => {
  for (const url of ["/", "/study-plan", "/classroom/biology?tab=notes", "/flashcards#due"]) {
    assert.equal(isInternalPath(url), true, url);
  }
});

test("anything that could leave the origin is rejected", () => {
  for (const url of [
    "https://evil.com",
    "//evil.com",
    "/\\evil.com",
    "\\\\evil.com",
    "javascript:alert(1)",
    "study-plan",
    "/ spaced",
    "",
    null,
    42,
    "/" + "a".repeat(600),
  ]) {
    assert.equal(isInternalPath(url), false, String(url));
  }
});

test("truncate keeps short text and ellipsises long text at the limit", () => {
  assert.equal(truncate("hello", 10), "hello");
  const cut = truncate("a".repeat(70), TITLE_MAX);
  assert.equal(cut.length, TITLE_MAX);
  assert.ok(cut.endsWith("…"));
});

test("buildPushPayload enforces limits and falls back to the dashboard", () => {
  const payload = buildPushPayload({
    title: "t".repeat(100),
    body: "b".repeat(300),
    url: "https://evil.com",
    tag: "announcement-abc",
  });
  assert.equal(payload.title.length, TITLE_MAX);
  assert.equal(payload.body.length, BODY_MAX);
  assert.equal(payload.url, "/dashboard");
  assert.equal(payload.tag, "announcement-abc");
  assert.equal(buildPushPayload({ title: "a", body: "b", tag: "x" }).url, "/dashboard");
  assert.equal(buildPushPayload({ title: "a", body: "b", url: "/practice", tag: "x" }).url, "/practice");
});

test("the serialised payload is far below the 4KB Web Push limit", () => {
  const payload = buildPushPayload({
    title: "t".repeat(100),
    body: "b".repeat(300),
    url: "/" + "p".repeat(400),
    tag: pushTag.announcement("c".repeat(30)),
  });
  assert.ok(Buffer.byteLength(JSON.stringify(payload)) < 3000);
});

test("tag formats", () => {
  assert.equal(pushTag.morning("2026-09-15"), "morning-2026-09-15");
  assert.equal(pushTag.streak("2026-09-15"), "streak-2026-09-15");
  assert.equal(pushTag.announcement("abc"), "announcement-abc");
});
