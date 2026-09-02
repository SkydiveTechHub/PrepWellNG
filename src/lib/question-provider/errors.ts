/**
 * How to treat a provider response, by status code. Measured against the live
 * API on 2026-09-02; their body echoes the same code in a `status` field.
 *
 *   200 -> a draw
 *   404 -> {"status":404,"message":"No questions found for those filters."}
 *   403 -> {"status":403,"message":"...no permission to query the \"x\" exam."}
 *   401 -> {"status":401,"message":"Invalid AccessToken."}
 */
export type ResponseClass = "ok" | "empty" | "terminal" | "retryable";

export function classifyStatus(httpStatus: number): ResponseClass {
  if (httpStatus === 200) return "ok";

  // The filter is genuinely empty. The ledger saturates it with rawCount 0 so
  // we never ask again — the catalogue contains combinations with nothing in
  // them, and retrying those forever is the runaway this design prevents.
  if (httpStatus === 404) return "empty";

  // Bad credentials or an exam our plan does not include. Retrying cannot fix
  // either, and hammering a 403 is how a key gets revoked.
  if (httpStatus === 401 || httpStatus === 403) return "terminal";

  // Everything else — throttling, server faults, anything unrecognised. Erring
  // toward "retryable" costs one call; erring toward "empty" would brand a
  // real paper as permanently barren.
  return "retryable";
}
