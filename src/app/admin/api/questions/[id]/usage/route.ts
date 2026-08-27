import { NextRequest, NextResponse } from "next/server";
import { getQuestionUsage } from "@/lib/admin-data";
import { requireAdminApi } from "@/lib/admin-session";

export const dynamic = "force-dynamic";

// GET /admin/api/questions/[id]/usage — dependent counts powering the
// delete-confirmation dialog.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  return NextResponse.json(await getQuestionUsage(id));
}
