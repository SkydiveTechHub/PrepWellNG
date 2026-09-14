import { NextResponse, type NextRequest } from "next/server";
import { deleteSessionCookies } from "@/lib/session-token";

export const dynamic = "force-dynamic";

/**
 * Finishes signing out a device that was signed out elsewhere (device limit,
 * or from Settings). The layouts detect it but can't delete the cookie from a
 * server component, so they redirect here. Public, and it only ever clears
 * the caller's own session cookie.
 */
export function GET(req: NextRequest) {
  const res = NextResponse.redirect(new URL("/login?reason=device", req.url));
  deleteSessionCookies(req, res);
  return res;
}
