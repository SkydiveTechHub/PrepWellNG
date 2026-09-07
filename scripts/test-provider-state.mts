import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EXHAUSTED_COOLDOWN_MS,
  isCircuitOpen,
  nextCircuit,
} from "../src/lib/question-provider/state";

const NOW = Date.UTC(2026, 8, 7, 12, 0, 0);

test("a provider we have never failed against is closed", () => {
  assert.equal(isCircuitOpen(null, NOW), false);
});

test("an OK row is closed", () => {
  assert.equal(isCircuitOpen({ state: "OK", cooldownUntil: null }, NOW), false);
});

test("EXHAUSTED is open until the cooldown expires", () => {
  const row = { state: "EXHAUSTED" as const, cooldownUntil: new Date(NOW + 60_000) };
  assert.equal(isCircuitOpen(row, NOW), true);
});

test("EXHAUSTED reopens for one probe once the cooldown expires", () => {
  // This is what makes topping up a wallet sufficient to resume: no admin
  // action, the next scheduled draw simply tries again.
  const row = { state: "EXHAUSTED" as const, cooldownUntil: new Date(NOW - 1) };
  assert.equal(isCircuitOpen(row, NOW), false);
});

test("EXHAUSTED with no cooldown recorded is closed rather than stuck", () => {
  // Fail safe: a half-written row must not wedge the provider forever.
  assert.equal(isCircuitOpen({ state: "EXHAUSTED", cooldownUntil: null }, NOW), false);
});

test("BLOCKED stays open regardless of any cooldown", () => {
  assert.equal(isCircuitOpen({ state: "BLOCKED", cooldownUntil: null }, NOW), true);
  assert.equal(
    isCircuitOpen({ state: "BLOCKED", cooldownUntil: new Date(NOW - 1) }, NOW),
    true,
  );
});

test("an exhausted failure arms the cooldown", () => {
  const next = nextCircuit("exhausted", NOW);
  assert.deepEqual(next, {
    state: "EXHAUSTED",
    cooldownUntil: new Date(NOW + EXHAUSTED_COOLDOWN_MS),
  });
});

test("a terminal failure blocks and needs a human", () => {
  assert.deepEqual(nextCircuit("terminal", NOW), { state: "BLOCKED", cooldownUntil: null });
});

test("a retryable failure does not touch the breaker", () => {
  // Throttling and 5xx are the ledger's business, not the breaker's.
  assert.equal(nextCircuit("retryable", NOW), null);
});
