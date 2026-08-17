import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { getLibraryShelfTolerant, getSubjectResources } from "@/lib/library";

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
      return NextResponse.json(await getSubjectResources(subjectId));
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
