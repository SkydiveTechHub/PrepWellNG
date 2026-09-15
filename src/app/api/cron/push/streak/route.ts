import { NextResponse } from "next/server";
import { cronGuard, deadlineFrom } from "@/lib/cron-auth";
import { readPushConfig } from "@/lib/push-config";
import { runReminders } from "@/lib/push-reminder-runner";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST /api/cron/push/streak — called every 5 minutes 19:00–19:55 Lagos by pg_cron
export async function POST(req: Request) {
  const startedAt = Date.now();
  const denied = cronGuard(req);
  if (denied) return denied;
  if (!readPushConfig()) {
    console.warn("cron: VAPID keys are not configured; skipping streak reminders");
    return new Response(null, { status: 204 });
  }

  try {
    const result = await runReminders("streak", { now: new Date(), deadline: deadlineFrom(startedAt) });
    return NextResponse.json(result);
  } catch (error) {
    console.error("Streak reminders failed:", error);
    return NextResponse.json({ error: "Streak reminders failed" }, { status: 500 });
  }
}
