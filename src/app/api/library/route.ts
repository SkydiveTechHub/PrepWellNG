import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { getLibraryShelfTolerant, getSubjectResources } from "@/lib/library";
import { can } from "@/lib/subscription";
import { tierOf } from "@/lib/entitlements";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // Fast JWT check — avoids the heavy auth() session enrichment round-trip.
  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET,
  });
  if (!token?.sub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const subjectId = searchParams.get("subjectId");

  if (subjectId) {
    try {
      // Reuse the token decoded above rather than calling getToken a second
      // time: the tier rides on the JWT, so deciding what to link costs
      // nothing extra.
      const tier = tierOf(
        (token as { profile?: { tier?: unknown } }).profile?.tier,
      );
      return NextResponse.json(
        await getSubjectResources(subjectId, {
          includePremium: can(tier, "premiumLibrary"),
        }),
      );
    } catch (error) {
      console.error("Library resources error:", error);
      return NextResponse.json(
        { error: "Failed to load resources" },
        { status: 500 },
      );
    }
  }

  try {
    return NextResponse.json(await getLibraryShelfTolerant(token.sub));
  } catch (error) {
    console.error("Library subjects error:", error);
    return NextResponse.json(
      { error: "Failed to load subjects" },
      { status: 500 },
    );
  }
}
