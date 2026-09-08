/**
 * The Paystack HTTP client.
 *
 * Kept deliberately thin: it normalises Paystack's payload into
 * `VerifiedTransaction` and does nothing else. Every decision made from that
 * data lives in `settlement.ts`, where it is unit tested.
 */

import type { VerifiedTransaction } from "@/lib/billing/settlement";

const PAYSTACK_API = "https://api.paystack.co";

const PLACEHOLDERS = new Set(["", "your-paystack-secret-key"]);

export function paystackSecret(): string | undefined {
  const key = process.env.PAYSTACK_SECRET_KEY?.trim();
  if (!key || PLACEHOLDERS.has(key)) return undefined;
  return key;
}

/**
 * Whether billing is configured at all.
 *
 * Follows the pattern auth.ts uses for the Google provider: with no key, the
 * feature is simply off — checkout answers 503 and the UI hides its buttons —
 * so local development without secrets keeps working instead of throwing.
 */
export function isBillingEnabled(): boolean {
  return paystackSecret() !== undefined;
}

export function appUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ??
    "http://localhost:3000"
  );
}

function requireSecret(): string {
  const secret = paystackSecret();
  if (!secret) throw new Error("PAYSTACK_SECRET_KEY is not configured");
  return secret;
}

async function paystackFetch(
  path: string,
  init: RequestInit,
): Promise<Record<string, unknown>> {
  const res = await fetch(`${PAYSTACK_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${requireSecret()}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
    // Never cached: these are money operations, and a stale verify would be
    // worse than a slow one.
    cache: "no-store",
  });

  const body = (await res.json().catch(() => null)) as {
    status?: boolean;
    message?: string;
    data?: Record<string, unknown>;
  } | null;

  if (!res.ok || !body?.status || !body.data) {
    throw new Error(
      `Paystack ${path} failed (${res.status}): ${body?.message ?? "no body"}`,
    );
  }

  return body.data;
}

export async function initializeTransaction({
  email,
  amountKobo,
  reference,
  callbackUrl,
  metadata,
}: {
  email: string;
  amountKobo: number;
  reference: string;
  callbackUrl: string;
  metadata: Record<string, string>;
}): Promise<{ authorizationUrl: string }> {
  const data = await paystackFetch("/transaction/initialize", {
    method: "POST",
    body: JSON.stringify({
      email,
      amount: amountKobo,
      reference,
      currency: "NGN",
      callback_url: callbackUrl,
      metadata,
    }),
  });

  const authorizationUrl = data.authorization_url;
  if (typeof authorizationUrl !== "string") {
    throw new Error("Paystack initialize returned no authorization_url");
  }

  return { authorizationUrl };
}

export async function verifyTransaction(
  reference: string,
): Promise<VerifiedTransaction> {
  const data = await paystackFetch(
    `/transaction/verify/${encodeURIComponent(reference)}`,
    { method: "GET" },
  );

  const paidAt = typeof data.paid_at === "string" ? new Date(data.paid_at) : null;

  return {
    reference: String(data.reference ?? reference),
    status: String(data.status ?? "unknown"),
    amountKobo: Number(data.amount ?? -1),
    currency: String(data.currency ?? ""),
    channel: typeof data.channel === "string" ? data.channel : null,
    paidAt: paidAt && !Number.isNaN(paidAt.getTime()) ? paidAt : null,
  };
}
