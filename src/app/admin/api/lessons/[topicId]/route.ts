import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-session";
import { getStoredLesson } from "@/lib/admin-data";

export const dynamic = "force-dynamic";

// GET /admin/api/lessons/[topicId] — what is currently stored, so the upload
// form can show the admin what they are about to replace.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ topicId: string }> },
) {
  // Wrapped like every sibling admin route (questions/route.ts,
  // questions/[id]/route.ts): an unhandled throw here would surface to the
  // upload form as an opaque failure with nothing in the server log.
  try {
    const guard = await requireAdminApi();
    if (!guard.ok) return guard.response;

    const { topicId } = await params;

    const stored = await getStoredLesson(topicId);
    if (!stored) {
      return NextResponse.json({ error: "Unknown topic" }, { status: 404 });
    }

    return NextResponse.json(stored);
  } catch (error) {
    console.error("Error loading lesson for topic:", error);
    return NextResponse.json({ error: "Failed to load lesson" }, { status: 500 });
  }
}
