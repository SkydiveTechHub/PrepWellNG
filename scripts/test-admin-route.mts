import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyAdminPath, isAdminPath } from "../src/lib/admin-route";

test("auth endpoints are always let through", () => {
  // Guarding these would make signing in impossible.
  assert.equal(classifyAdminPath("/admin/api/auth/csrf"), "auth");
  assert.equal(classifyAdminPath("/admin/api/auth/callback/admin-credentials"), "auth");
});

test("the login page is its own case", () => {
  assert.equal(classifyAdminPath("/admin/login"), "login");
});

test("everything else under /admin is console", () => {
  assert.equal(classifyAdminPath("/admin"), "console");
  assert.equal(classifyAdminPath("/admin/questions"), "console");
  assert.equal(classifyAdminPath("/admin/api/questions"), "console");
  assert.equal(classifyAdminPath("/admin/team"), "console");
});

test("non-admin paths are not classified", () => {
  assert.equal(classifyAdminPath("/dashboard"), null);
  assert.equal(classifyAdminPath("/login"), null);
  assert.equal(classifyAdminPath("/"), null);
});

test("a path merely starting with the letters admin is not admin", () => {
  // /administration must not inherit the console's rules.
  assert.equal(classifyAdminPath("/administration"), null);
  assert.equal(classifyAdminPath("/adminfoo"), null);
});

test("the login prefix does not swallow neighbouring routes", () => {
  assert.equal(classifyAdminPath("/admin/loginsomething"), "console");
});

test("the auth prefix does not swallow neighbouring routes", () => {
  // /admin/api/authorize must not inherit the unauthenticated auth passthrough.
  assert.equal(classifyAdminPath("/admin/api/authorize"), "console");
});

test("isAdminPath requires a path boundary, not just a prefix match", () => {
  assert.equal(isAdminPath("/admin"), true);
  assert.equal(isAdminPath("/admin/questions"), true);
  assert.equal(isAdminPath("/adminXYZ"), false);
  assert.equal(isAdminPath("//evil.example"), false);
  assert.equal(isAdminPath("/dashboard"), false);
});
