import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { pushSubscriptionSchema, unsubscribeSchema } from "@/lib/push-validators";
import { deleteSubscription, saveSubscription } from "@/lib/push-subscription-data";

export const dynamic = "force-dynamic";

async function requireStudent() {
  const session = await auth();
  return session?.user?.id ?? null;
}

// POST /api/push/subscription — store or refresh this device's subscription
export async function POST(req: NextRequest) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Ties the subscription to this sign-in, so revoking the device removes it.
  const deviceId = (session.user as { deviceId?: string }).deviceId ?? null;

  const limit = await rateLimit({ key: `push-subscribe:${userId}`, limit: 10, windowSeconds: 60 });
  if (!limit.ok) return tooManyRequests(limit.retryAfterSeconds);

  const parsed = pushSubscriptionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
  }

  try {
    await saveSubscription(userId, parsed.data, req.headers.get("user-agent"), deviceId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Saving push subscription failed:", error);
    return NextResponse.json({ error: "Could not save subscription" }, { status: 500 });
  }
}

// DELETE /api/push/subscription — forget this device (sign-out, master switch off)
export async function DELETE(req: NextRequest) {
  const userId = await requireStudent();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = unsubscribeSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  try {
    await deleteSubscription(userId, parsed.data.endpoint);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Deleting push subscription failed:", error);
    return NextResponse.json({ error: "Could not remove subscription" }, { status: 500 });
  }
}
