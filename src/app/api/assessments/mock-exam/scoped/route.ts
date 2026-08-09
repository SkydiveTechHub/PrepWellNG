import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { scopedMockExamSchema } from "@/lib/validators";
import { generateScopedMockExam } from "@/lib/assessment-generation";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// POST /api/assessments/mock-exam/scoped
// A mock exam drawn from one subject's past questions, restricted to the topics
// taught in a chosen class/term — or a run of them, e.g. SS1 1st to SS1 3rd.
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const studentId = session.user.id;

    const limit = rateLimit({
      key: `scoped-mock:${studentId}`,
      limit: 12,
      windowSeconds: 60,
    });
    if (!limit.ok) return tooManyRequests(limit.retryAfterSeconds);

    const parsed = scopedMockExamSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const result = await generateScopedMockExam(studentId, parsed.data);

    if (result === "subject-not-found") {
      return NextResponse.json({ error: "Subject not found." }, { status: 404 });
    }
    if (result.outcome === "no-questions-in-scope") {
      return NextResponse.json(
        {
          error: result.message,
          reason: "NO_QUESTIONS_IN_SCOPE",
          scope: result.scope,
        },
        { status: 422 },
      );
    }

    // `outcome` is the discriminator the service returns, not part of the
    // response contract — keep the payload byte-identical to before.
    const { outcome, ...payload } = result;
    void outcome;
    return NextResponse.json(payload);
  } catch (error) {
    console.error("Error generating scoped mock exam:", error);
    return NextResponse.json(
      { error: "Failed to generate the mock exam" },
      { status: 500 },
    );
  }
}
