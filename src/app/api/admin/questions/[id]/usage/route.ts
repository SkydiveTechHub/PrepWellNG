import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
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
  const [responseCount, assessmentCount] = await Promise.all([
    db.questionResponse.count({ where: { questionId: id } }),
    db.assessmentQuestion.count({ where: { questionId: id } }),
  ]);

  return NextResponse.json({
    responseCount,
    assessmentCount,
    deletable: responseCount === 0 && assessmentCount === 0,
  });
}
