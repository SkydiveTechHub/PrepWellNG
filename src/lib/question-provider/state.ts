import type { ProviderFailureKind } from "./types";

/**
 * How long an out-of-credit provider is left alone before one probe.
 *
 * Short enough that topping up a wallet takes effect while someone is still
 * watching, long enough that a day of traffic against an unfunded account
 * costs ~96 calls rather than one per request.
 */
export const EXHAUSTED_COOLDOWN_MS = 15 * 60 * 1000;

export type CircuitRow = {
  state: "OK" | "EXHAUSTED" | "BLOCKED";
  cooldownUntil: Date | null;
};

/** May we spend a request on this provider right now? */
export function isCircuitOpen(row: CircuitRow | null, now: number): boolean {
  if (!row) return false;

  // A revoked key or an unentitled plan cannot fix itself; probing it is how
  // a key gets banned rather than restored.
  if (row.state === "BLOCKED") return true;

  if (row.state === "EXHAUSTED") {
    // No cooldown recorded means a half-written row. Fail closed-circuit
    // (i.e. allow the call) rather than wedging the provider indefinitely.
    return row.cooldownUntil !== null && row.cooldownUntil.getTime() > now;
  }

  return false;
}

/**
 * The breaker transition a failure implies, or null to leave it alone.
 *
 * Retryable failures — throttling, 5xx, a dropped connection — are the
 * ledger's concern: they leave the fetch PENDING and cost one call next time.
 * Only the two states that should stop us calling at all move the breaker.
 */
export function nextCircuit(
  kind: ProviderFailureKind,
  now: number,
): { state: CircuitRow["state"]; cooldownUntil: Date | null } | null {
  if (kind === "exhausted") {
    return { state: "EXHAUSTED", cooldownUntil: new Date(now + EXHAUSTED_COOLDOWN_MS) };
  }
  if (kind === "terminal") {
    return { state: "BLOCKED", cooldownUntil: null };
  }
  return null;
}
