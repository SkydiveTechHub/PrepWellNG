import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { requireAdminApi } from "@/lib/admin-session";
import { recordAudit } from "@/lib/admin-audit";
import { CATALOGUE_TAG } from "@/lib/catalogue";
import { providerBackfillSchema } from "@/lib/validators";
import { ensureQuestionsCached, saturate, readLedger } from "@/lib/question-provider/ingest";

export const dynamic = "force-dynamic";
// saturate() runs the remaining draws inline rather than after the response,
// since this is an admin tool where completeness matters more than latency.
export const maxDuration = 300;

// POST /admin/api/provider/backfill — saturate one paper from the provider.
// The only route that reaches the provider until it is exposed to students.
export async function POST(req: NextRequest) {
  try {
    const guard = await requireAdminApi();
    if (!guard.ok) return guard.response;

    const parsed = providerBackfillSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const filter = parsed.data;
    await ensureQuestionsCached(filter, 50);
    // Run the remaining draws inline: this is an admin tool, not a student
    // request, so completeness matters more than latency here.
    await saturate(filter);

    const ledger = await readLedger(filter);

    revalidateTag(CATALOGUE_TAG, "max");

    await recordAudit({
      actorId: guard.actor.id,
      action: "provider.backfill",
      entity: "ProviderFetch",
      summary:
        `Backfilled ${filter.subjectSlug} ${filter.examType} ${filter.examYear}: ` +
        `${ledger?.rawCount ?? 0} captured, ${ledger?.promotedCount ?? 0} promoted ` +
        `(${ledger?.status ?? "UNKNOWN"}).`,
    });

    return NextResponse.json({ ledger });
  } catch (error) {
    console.error("Provider backfill failed:", error);
    return NextResponse.json({ error: "Backfill failed" }, { status: 500 });
  }
}
