import { NextResponse } from "next/server";
import { appUrl, verifyTransaction } from "@/lib/billing/paystack";
import { applyChargeSuccess } from "@/lib/billing/subscription-data";

export const dynamic = "force-dynamic";

/**
 * Where Paystack sends the buyer's browser back.
 *
 * This exists for instant feedback only. The webhook is the authority, and
 * correctness must never depend on the user's browser returning — they can
 * close the tab on the Paystack page and the charge still lands.
 */
export async function GET(req: Request) {
  const reference = new URL(req.url).searchParams.get("reference");
  const destination = (status: string) =>
    NextResponse.redirect(`${appUrl()}/settings/billing?status=${status}`);

  if (!reference) return destination("missing");

  try {
    const transaction = await verifyTransaction(reference);
    const outcome = await applyChargeSuccess(transaction);

    // "already-applied" means the webhook beat the browser back — from the
    // buyer's point of view that is a success, not an error.
    return destination(
      outcome === "activated" || outcome === "already-applied"
        ? "success"
        : "failed",
    );
  } catch (error) {
    console.error("[billing] callback verify failed", reference, error);
    // Deliberately not an error page: the webhook will still settle this.
    return destination("pending");
  }
}
