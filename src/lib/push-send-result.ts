// What a push service's answer means for the delivery row and for the stored
// subscription. Pure, so every branch is tested without a push service.

export type SendOutcome = "sent" | "gone" | "invalid" | "retry";

export const MAX_DELIVERY_ATTEMPTS = 3;
export const MAX_SUBSCRIPTION_FAILURES = 5;

export function classifySendResult(
  result: { statusCode?: number } | null | undefined,
): SendOutcome {
  const code = result?.statusCode;
  if (code === undefined) return "retry"; // network error, DNS, timeout
  if (code >= 200 && code < 300) return "sent";
  if (code === 404 || code === 410) return "gone";
  if (code === 400 || code === 413) return "invalid";
  return "retry"; // 429, 5xx and anything unexpected
}

export function nextDelivery(
  outcome: SendOutcome,
  attempts: number,
): { status: "SENT" | "GONE" | "FAILED" | "PENDING"; attempts: number } {
  const next = attempts + 1;
  switch (outcome) {
    case "sent":
      return { status: "SENT", attempts: next };
    case "gone":
      return { status: "GONE", attempts: next };
    case "invalid":
      return { status: "FAILED", attempts: next };
    case "retry":
      return { status: next >= MAX_DELIVERY_ATTEMPTS ? "FAILED" : "PENDING", attempts: next };
  }
}

export type SubscriptionEffect =
  | { kind: "success" }
  | { kind: "delete" }
  | { kind: "fail"; failureCount: number }
  | { kind: "none" };

/**
 * `final` is true when this failure will not be retried: always for
 * reminders, and on the last attempt for broadcasts. Only final transient
 * failures count against the subscription.
 */
export function subscriptionEffect(
  outcome: SendOutcome,
  failureCount: number,
  final: boolean,
): SubscriptionEffect {
  if (outcome === "sent") return { kind: "success" };
  if (outcome === "gone") return { kind: "delete" };
  if (outcome === "invalid" || !final) return { kind: "none" };
  const next = failureCount + 1;
  return next >= MAX_SUBSCRIPTION_FAILURES ? { kind: "delete" } : { kind: "fail", failureCount: next };
}

export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await fn(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
