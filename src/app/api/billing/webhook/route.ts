import { NextResponse } from "next/server";
import { paystackSecret, verifyTransaction } from "@/lib/billing/paystack";
import { verifyPaystackSignature } from "@/lib/billing/signature";
import {
  applyChargeSuccess,
  forgetPaystackEvent,
  recordPaystackEvent,
} from "@/lib/billing/subscription-data";

export const dynamic = "force-dynamic";

/**
 * The authoritative confirmation path.
 *
 * Route Handlers receive a plain Web Request, so `req.text()` is the exact
 * body Paystack signed. Never re-serialize it — `JSON.stringify(await
 * req.json())` reorders nothing but reformats everything, and the HMAC fails.
 */
export async function POST(req: Request) {
  const rawBody = await req.text();

  const ok = verifyPaystackSignature({
    rawBody,
    signature: req.headers.get("x-paystack-signature"),
    secret: paystackSecret(),
  });

  if (!ok) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: { event?: string; data?: { reference?: string } };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Malformed body" }, { status: 400 });
  }

  const type = event.event ?? "unknown";
  const reference = event.data?.reference;

  if (!reference) {
    // Nothing to key idempotency on. Answer 200 so Paystack stops retrying an
    // event we can never act on.
    return NextResponse.json({ received: true });
  }

  const fresh = await recordPaystackEvent({ reference, type, payload: event });
  if (!fresh) return NextResponse.json({ received: true, duplicate: true });

  if (type !== "charge.success") {
    // Recorded for the audit trail and acknowledged. Returning anything but a
    // 2xx here would have Paystack retrying every event type we do not use.
    return NextResponse.json({ received: true });
  }

  try {
    // Re-verify against the API rather than trusting the payload's amount. The
    // signature proves the body came from Paystack; verify proves the money
    // actually settled.
    const transaction = await verifyTransaction(reference);
    const outcome = await applyChargeSuccess(transaction);
    return NextResponse.json({ received: true, outcome });
  } catch (error) {
    console.error("[billing] webhook apply failed", reference, error);
    // A 500 tells Paystack to retry. The event row is already written, so the
    // retry would be swallowed as a duplicate — delete it so the retry can act.
    await forgetPaystackEvent(reference, type);
    return NextResponse.json({ error: "Apply failed" }, { status: 500 });
  }
}
