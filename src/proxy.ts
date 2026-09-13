import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { classifyAdminPath, ADMIN_SESSION_COOKIE } from "@/lib/admin-route";
import { isPublicPath } from "@/lib/public-routes";
import { getSessionToken } from "@/lib/session-token";

const AUTH_ROUTES = ["/login", "/register"];

function isAuthRoute(pathname: string) {
  return AUTH_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

export default async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  const adminPath = classifyAdminPath(pathname);
  if (adminPath) {
    if (adminPath === "auth") return NextResponse.next();

    // Optimistic only. Next's docs are explicit that Proxy "should not be used
    // as a full session management or authorization solution" — the wall is
    // admin-session.ts, which re-reads the row on every request.
    //
    // salt is not optional: @auth/core derives the decryption key from secret
    // AND salt, and salt defaults to the cookie name. Omitting it returns null
    // silently, which presents as an unexplained redirect loop.
    const adminToken = await getToken({
      req,
      secret: process.env.ADMIN_AUTH_SECRET,
      cookieName: ADMIN_SESSION_COOKIE,
      salt: ADMIN_SESSION_COOKIE,
    });

    if (adminPath === "login") {
      return adminToken
        ? NextResponse.redirect(new URL("/admin", req.url))
        : NextResponse.next();
    }

    if (adminToken) return NextResponse.next();

    if (pathname.startsWith("/admin/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const adminLogin = new URL("/admin/login", req.url);
    adminLogin.searchParams.set("callbackUrl", `${pathname}${search}`);
    return NextResponse.redirect(adminLogin);
  }

  // Not a bare getToken: see session-token.ts for the cookie-name trap that
  // had /login and /dashboard redirecting into each other in production.
  const token = await getSessionToken(req);

  // Signed-in users belong in the app, not on the marketing page.
  if (pathname === "/" && token) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  if (isAuthRoute(pathname)) {
    return token
      ? NextResponse.redirect(new URL("/dashboard", req.url))
      : NextResponse.next();
  }

  if (token) return NextResponse.next();

  // The public surface: marketing page, the indexable /learn and
  // /past-questions trees, and the crawler-facing metadata files. See
  // src/lib/public-routes.ts.
  if (isPublicPath(pathname)) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const login = new URL("/login", req.url);
  login.searchParams.set("callbackUrl", `${pathname}${search}`);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: [
    // api/billing/webhook is excluded because Paystack is not a signed-in
    // user: the auth branch below would answer its POST with a 401, which
    // Paystack reads as a delivery failure and we would never see the charge.
    // The route authenticates itself by HMAC instead.
    "/((?!api/auth|api/billing/webhook|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
