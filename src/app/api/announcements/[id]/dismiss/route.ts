import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dismissAnnouncement } from "@/lib/announcement-data";

export const dynamic = "force-dynamic";

// POST /api/announcements/[id]/dismiss — hide the banner on every device
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  try {
    const ok = await dismissAnnouncement(session.user.id, id);
    if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Dismissing announcement failed:", error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
