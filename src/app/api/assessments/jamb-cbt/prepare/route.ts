import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { jambCbtSchema } from "@/lib/validators";
import { prepareJambYear } from "@/lib/jamb-cbt-preparation";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// POST /api/assessments/jamb-cbt/prepare
// Pulls the four papers of one sitting into the bank and reports what the
// bank now holds. Called when a student picks a year, so the provider fetch
// and any shortfall both land in the picker rather than behind "Start exam".
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Looser than the generator's: preparing is how a student advances a
    // half-drawn year, so repeated asks are the intended use.
    const limit = await rateLimit({
      key: `jamb-cbt-prepare:${session.user.id}`,
      limit: 20,
      windowSeconds: 60,
    });
    if (!limit.ok) return tooManyRequests(limit.retryAfterSeconds);

    const parsed = jambCbtSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const result = await prepareJambYear(parsed.data);

    switch (result.outcome) {
      case "english-missing":
        return NextResponse.json(
          { error: "English Language is not set up in the subject catalogue." },
          { status: 500 },
        );
      case "bad-selection":
        return NextResponse.json({ error: result.message }, { status: 400 });
      case "subjects-unavailable":
        return NextResponse.json(
          { error: "One or more chosen subjects aren't available for JAMB." },
          { status: 400 },
        );
      default:
        // A year that is still short is a 200: it is a report on the bank, not
        // a failed request, and the picker renders the shortfall.
        return NextResponse.json(result);
    }
  } catch (error) {
    console.error("Error preparing JAMB CBT year:", error);
    return NextResponse.json(
      { error: "Failed to prepare that year" },
      { status: 500 },
    );
  }
}
