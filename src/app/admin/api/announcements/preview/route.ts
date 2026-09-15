import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/admin-session";
import { audienceFilterSchema } from "@/lib/push-audience";
import { previewAudience } from "@/lib/announcement-data";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ audience: audienceFilterSchema });

// POST /admin/api/announcements/preview — how many students and devices an audience reaches
export async function POST(req: NextRequest) {
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid audience" }, { status: 400 });
  }
  try {
    return NextResponse.json(await previewAudience(parsed.data.audience));
  } catch (error) {
    console.error("Audience preview failed:", error);
    return NextResponse.json({ error: "Failed to count the audience" }, { status: 500 });
  }
}
