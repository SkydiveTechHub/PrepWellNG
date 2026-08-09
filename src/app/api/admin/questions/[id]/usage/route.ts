import { NextRequest, NextResponse } from "next/server";
import { getQuestionUsage } from "@/lib/admin-data";
import { requireAdmin } from "@/lib/admin-guard";

export const dynamic = "force-dynamic";

// GET /api/admin/questions/[id]/usage — dependent counts powering the
// delete-confirmation dialog.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  return NextResponse.json(await getQuestionUsage(id));
}
