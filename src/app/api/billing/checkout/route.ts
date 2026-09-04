import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { checkoutSchema } from "@/lib/validators";
import { isPurchasableTier, planFor } from "@/lib/subscription";
import { appUrl, initializeTransaction, isBillingEnabled } from "@/lib/billing/paystack";
import { createPendingSubscription } from "@/lib/billing/subscription-data";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isBillingEnabled()) {
    return NextResponse.json(
      { error: "Payments are not available right now." },
      { status: 503 },
    );
  }

  // Keyed by user, not IP: initializing transactions is cheap for us and noisy
  // in the Paystack dashboard, and a signed-in user is the right unit here.
  const limit = rateLimit({
    key: `billing-checkout:${userId}`,
    limit: 10,
    windowSeconds: 60,
  });
  if (!limit.ok) return tooManyRequests(limit.retryAfterSeconds);

  const parsed = checkoutSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed" }, { status: 400 });
  }

  const { tier, period } = parsed.data;
  if (!isPurchasableTier(tier)) {
    return NextResponse.json(
      { error: "That plan cannot be purchased." },
      { status: 400 },
    );
  }

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });
  if (!user?.email) {
    return NextResponse.json(
      { error: "Add an email address to your account before subscribing." },
      { status: 400 },
    );
  }

  // The price comes from the catalogue, never from the request body — the
  // client says which plan, the server says what it costs.
  const plan = planFor(tier, period);
  const { reference } = await createPendingSubscription({ userId, tier, period });

  try {
    const { authorizationUrl } = await initializeTransaction({
      email: user.email,
      amountKobo: plan.amountKobo,
      reference,
      callbackUrl: `${appUrl()}/api/billing/callback`,
      metadata: { userId, tier, period },
    });

    return NextResponse.json({ authorizationUrl });
  } catch (error) {
    console.error("[billing] initialize failed", error);
    return NextResponse.json(
      { error: "Could not start the payment. Please try again." },
      { status: 502 },
    );
  }
}
