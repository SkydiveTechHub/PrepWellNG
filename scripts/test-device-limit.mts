import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEVICE_LIMIT,
  deviceLabel,
  deviceState,
  devicesToRevoke,
  formatLastActive,
  isDeviceLimited,
  revokedTokenAction,
  shouldTouchLastSeen,
  studentTokenState,
} from "../src/lib/device-limit";

const at = (iso: string) => new Date(iso);

test("the limit is two devices", () => {
  assert.equal(DEVICE_LIMIT, 2);
});

test("only paid tiers are limited", () => {
  assert.equal(isDeviceLimited("FREEMIUM"), false);
  assert.equal(isDeviceLimited("STANDARD"), true);
  assert.equal(isDeviceLimited("PREMIUM"), true);
});

test("under or at the limit nothing is revoked", () => {
  const devices = [
    { id: "new", lastSeenAt: at("2026-09-13T10:00:00Z") },
    { id: "a", lastSeenAt: at("2026-09-13T09:00:00Z") },
  ];
  assert.deepEqual(devicesToRevoke(devices, "new", 2), []);
  assert.deepEqual(devicesToRevoke(devices.slice(0, 1), "new", 2), []);
});

test("over the limit the least recently used devices are revoked", () => {
  const devices = [
    { id: "old", lastSeenAt: at("2026-09-10T10:00:00Z") },
    { id: "recent", lastSeenAt: at("2026-09-13T09:00:00Z") },
    { id: "older", lastSeenAt: at("2026-09-11T10:00:00Z") },
    { id: "new", lastSeenAt: at("2026-09-13T10:00:00Z") },
  ];
  assert.deepEqual(devicesToRevoke(devices, "new", 2).sort(), ["old", "older"]);
});

test("the new device is kept even if its timestamp is oldest", () => {
  // Clock skew between app instances must not sign out the device that just signed in.
  const devices = [
    { id: "new", lastSeenAt: at("2026-09-01T00:00:00Z") },
    { id: "a", lastSeenAt: at("2026-09-13T09:00:00Z") },
    { id: "b", lastSeenAt: at("2026-09-13T08:00:00Z") },
  ];
  assert.deepEqual(devicesToRevoke(devices, "new", 2), ["b"]);
});

test("ties on lastSeenAt are broken deterministically", () => {
  const same = at("2026-09-13T09:00:00Z");
  const devices = [
    { id: "new", lastSeenAt: same },
    { id: "a", lastSeenAt: same },
    { id: "b", lastSeenAt: same },
  ];
  const first = devicesToRevoke(devices, "new", 2);
  const second = devicesToRevoke([...devices].reverse(), "new", 2);
  assert.equal(first.length, 1);
  assert.deepEqual(first, second);
});

test("device labels name the browser and platform", () => {
  assert.equal(
    deviceLabel(
      "Mozilla/5.0 (Linux; Android 13; SM-A135F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36",
    ),
    "Chrome on Android",
  );
  assert.equal(
    deviceLabel(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
    ),
    "Safari on iPhone",
  );
  assert.equal(
    deviceLabel(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 Edg/128.0.0.0",
    ),
    "Edge on Windows",
  );
  assert.equal(
    deviceLabel("Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0"),
    "Firefox on Linux",
  );
  assert.equal(
    deviceLabel(
      "Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36",
    ),
    "Samsung Internet on Android",
  );
  assert.equal(
    deviceLabel(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
    ),
    "Safari on macOS",
  );
});

test("an unrecognised or missing user agent gets a generic label", () => {
  assert.equal(deviceLabel(null), "Unknown device");
  assert.equal(deviceLabel(""), "Unknown device");
  assert.equal(deviceLabel("curl/8.0"), "Unknown device");
});

test("lastSeenAt is written at most every 15 minutes", () => {
  const now = at("2026-09-13T10:00:00Z");
  assert.equal(shouldTouchLastSeen(at("2026-09-13T09:50:00Z"), now), false);
  assert.equal(shouldTouchLastSeen(at("2026-09-13T09:44:00Z"), now), true);
});

test("device state on refresh", () => {
  assert.equal(deviceState(undefined, undefined), "untracked");
  assert.equal(deviceState("d1", { revokedAt: null }), "active");
  assert.equal(deviceState("d1", { revokedAt: at("2026-09-13T10:00:00Z") }), "revoked");
  // Row gone (e.g. deleted by an admin tool) is treated as revoked.
  assert.equal(deviceState("d1", undefined), "revoked");
});

test("student token state", () => {
  assert.equal(studentTokenState(null), "none");
  assert.equal(studentTokenState({ deviceRevoked: true }), "revoked");
  assert.equal(studentTokenState({ sub: "u1" }), "active");
});

test("a revoked token on an API route gets a 401", () => {
  assert.equal(
    revokedTokenAction({ pathname: "/api/attempts", reason: null, isPublic: false }),
    "unauthorized",
  );
});

test("a revoked token on an app page is sent to login with the reason", () => {
  assert.equal(
    revokedTokenAction({ pathname: "/dashboard", reason: null, isPublic: false }),
    "redirect-with-reason",
  );
});

test("a revoked token on /login without the reason gains it, once", () => {
  // The layout guard redirects to a bare /login; the notice must still show.
  assert.equal(
    revokedTokenAction({ pathname: "/login", reason: null, isPublic: false }),
    "redirect-with-reason",
  );
  assert.equal(
    revokedTokenAction({ pathname: "/login", reason: "device", isPublic: false }),
    "continue",
  );
});

test("a revoked token on public pages and /register just continues", () => {
  assert.equal(revokedTokenAction({ pathname: "/", reason: null, isPublic: true }), "continue");
  assert.equal(revokedTokenAction({ pathname: "/terms", reason: null, isPublic: true }), "continue");
  assert.equal(revokedTokenAction({ pathname: "/register", reason: null, isPublic: false }), "continue");
});

test("last active text", () => {
  const now = at("2026-09-13T10:00:00Z");
  assert.equal(formatLastActive(at("2026-09-13T09:55:00Z"), now), "Active recently");
  assert.equal(formatLastActive(at("2026-09-13T09:20:00Z"), now), "Last active 40 minutes ago");
  assert.equal(formatLastActive(at("2026-09-13T09:00:00Z"), now), "Last active 1 hour ago");
  assert.equal(formatLastActive(at("2026-09-13T05:00:00Z"), now), "Last active 5 hours ago");
  assert.equal(formatLastActive(at("2026-09-12T09:00:00Z"), now), "Last active 1 day ago");
  assert.equal(formatLastActive(at("2026-09-06T10:00:00Z"), now), "Last active 7 days ago");
});
