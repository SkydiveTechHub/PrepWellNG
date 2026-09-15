import { NextResponse } from "next/server";
import { cronGuard, deadlineFrom } from "@/lib/cron-auth";
import { readPushConfig } from "@/lib/push-config";
import { drainAnnouncements } from "@/lib/announcement-drain";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST /api/cron/push/drain — called every minute by pg_cron
export async function POST(req: Request) {
  const startedAt = Date.now();
  const denied = cronGuard(req);
  if (denied) return denied;
  if (!readPushConfig()) {
    console.warn("cron: VAPID keys are not configured; skipping announcement drain");
    return new Response(null, { status: 204 });
  }

  try {
    return NextResponse.json(await drainAnnouncements({ deadline: deadlineFrom(startedAt) }));
  } catch (error) {
    console.error("Announcement drain failed:", error);
    return NextResponse.json({ error: "Announcement drain failed" }, { status: 500 });
  }
}
