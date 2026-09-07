export type ResponseClass = "ok" | "empty" | "terminal" | "retryable" | "exhausted";

/**
 * Wallet-empty wording, as sent by the providers we call.
 *
 * Matched against the body because the status code alone cannot separate
 * "this account is out of money" — which reverses the moment someone tops
 * up — from "this key may never have this resource", which does not.
 */
const OUT_OF_CREDIT =
  /insufficient\s+credit|top\s*[- ]?up|out\s+of\s+credits?|credits?\s+exhausted|quota\s+exceeded/i;

export function classifyStatus(
  httpStatus: number,
  body?: { message?: string } | null,
): ResponseClass {
  if (httpStatus === 200) return "ok";

  // The filter is genuinely empty. The ledger saturates it with rawCount 0 so
  // we never ask again — the catalogue contains combinations with nothing in
  // them, and retrying those forever is the runaway this design prevents.
  if (httpStatus === 404) return "empty";

  // Unambiguous by status alone.
  if (httpStatus === 402) return "exhausted";

  // A bad token is permanent regardless of what the body says.
  if (httpStatus === 401) return "terminal";

  // The fork this function exists for. Absent or unreadable body: assume the
  // permanent cause, because a wrong "exhausted" retries a revoked key every
  // cooldown forever, while a wrong "terminal" is repaired by one admin reset.
  if (httpStatus === 403) {
    return body?.message && OUT_OF_CREDIT.test(body.message) ? "exhausted" : "terminal";
  }

  // Everything else — throttling, server faults, anything unrecognised. Erring
  // toward "retryable" costs one call; erring toward "empty" would brand a
  // real paper as permanently barren.
  return "retryable";
}
