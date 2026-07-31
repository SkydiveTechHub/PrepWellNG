import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { db } from "@/lib/db";
import { relevantTrackCategories } from "@/lib/subjects";

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
      const resources = await db.subjectResource.findMany({
        where: { subjectId },
        orderBy: [{ orderIndex: "asc" }, { title: "asc" }],
      });
      return NextResponse.json(resources);
    } catch (error) {
      console.error("Library resources error:", error);
      return NextResponse.json(
        { error: "Failed to load resources" },
        { status: 500 },
      );
    }
  }

  // User's track decides which subjects are relevant. If the lookup fails,
  // fall back to showing everything rather than erroring out.
  let track: string | null = null;
  try {
    const user = await db.user.findUnique({
      where: { id: token.sub },
      select: { track: true },
    });
    track = user?.track ?? null;
  } catch (error) {
    console.error("Library track lookup error:", error);
  }

  const relevant = relevantTrackCategories(track);

  try {
    const subjects = await db.subject.findMany({
      where: { trackCategory: { in: [...relevant] } },
      orderBy: [{ trackCategory: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        slug: true,
        code: true,
        description: true,
        trackCategory: true,
        _count: { select: { resources: true } },
      },
    });
    return NextResponse.json(subjects);
  } catch (error) {
    console.error("Library subjects error:", error);
    return NextResponse.json(
      { error: "Failed to load subjects" },
      { status: 500 },
    );
  }
}
