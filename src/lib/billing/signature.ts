/**
 * The Paystack webhook signature.
 *
 * Paystack signs the raw request body with HMAC-SHA512 keyed by the secret key
 * and sends the hex digest in `x-paystack-signature`. The check is worthless
 * against a re-serialized body, so the caller must pass the exact bytes it
 * received — `await req.text()`, never `JSON.stringify(await req.json())`.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export function paystackSignature(rawBody: string, secret: string): string {
  return createHmac("sha512", secret).update(rawBody, "utf8").digest("hex");
}

export function verifyPaystackSignature({
  rawBody,
  signature,
  secret,
}: {
  rawBody: string;
  signature: string | null | undefined;
  secret: string | undefined;
}): boolean {
  if (!secret || !signature) return false;

  const expected = paystackSignature(rawBody, secret);

  // Compare as hex text of equal length. timingSafeEqual throws outright on a
  // length mismatch, so a truncated header would otherwise be a 500 — which is
  // itself an oracle. Fail closed instead.
  if (signature.length !== expected.length) return false;

  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}
