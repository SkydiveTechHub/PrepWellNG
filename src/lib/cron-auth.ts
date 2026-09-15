import { createHash, timingSafeEqual } from "node:crypto";
import { readCronSecret } from "@/lib/push-config";

export type CronCheck = "ok" | "unauthorized" | "method-not-allowed" | "not-configured";

/** Vercel Hobby caps functions at 60s; stop starting new work well before. */
export const CRON_BUDGET_MS = 40_000;

export function deadlineFrom(startedAt: number): number {
  return startedAt + CRON_BUDGET_MS;
}

// Hashing first makes both buffers the same length, so timingSafeEqual never
// throws and the comparison leaks nothing about the secret's length.
function sameSecret(a: string, b: string): boolean {
  const left = createHash("sha256").update(a).digest();
  const right = createHash("sha256").update(b).digest();
  return timingSafeEqual(left, right);
}

export function checkCronRequest(input: {
  method: string;
  authorization: string | null;
  secret: string | null;
}): CronCheck {
  if (input.method !== "POST") return "method-not-allowed";
  if (!input.secret) return "not-configured";
  const header = input.authorization ?? "";
  if (!header.startsWith("Bearer ")) return "unauthorized";
  return sameSecret(header.slice("Bearer ".length), input.secret) ? "ok" : "unauthorized";
}

/** Returns a response to send, or null to proceed. */
export function cronGuard(req: Request): Response | null {
  const check = checkCronRequest({
    method: req.method,
    authorization: req.headers.get("authorization"),
    secret: readCronSecret(),
  });
  if (check === "ok") return null;
  if (check === "not-configured") {
    console.warn("cron: CRON_SECRET is not configured; skipping");
    return new Response(null, { status: 204 });
  }
  if (check === "method-not-allowed") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}
