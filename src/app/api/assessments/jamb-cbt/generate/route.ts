import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { jambCbtSchema } from "@/lib/validators";
import { generateJambCbtPaper } from "@/lib/jamb-cbt-generation";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// POST /api/assessments/jamb-cbt/generate
// Assembles one official-shape JAMB paper: English (60) + three chosen
// subjects (40 each) from a single year, 180 questions in 2 hours, out of 400.
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const studentId = session.user.id;

    // The heaviest generator in the app: 180 questions and 180 join rows.
    const limit = rateLimit({
      key: `jamb-cbt:${studentId}`,
      limit: 6,
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

    const result = await generateJambCbtPaper(studentId, parsed.data);

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
      case "insufficient-coverage":
        return NextResponse.json(
          {
            error: result.message,
            reason: "INSUFFICIENT_QUESTIONS",
            examYear: result.examYear,
            coverage: result.coverage,
            shortfalls: result.shortfalls,
          },
          { status: 422 },
        );
      case "short-bank":
        return NextResponse.json(
          { error: result.message, reason: "INSUFFICIENT_QUESTIONS" },
          { status: 422 },
        );
      default:
        return NextResponse.json(result.payload);
    }
  } catch (error) {
    console.error("Error generating JAMB CBT paper:", error);
    return NextResponse.json(
      { error: "Failed to generate the CBT paper" },
      { status: 500 },
    );
  }
}
