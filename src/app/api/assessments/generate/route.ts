import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { generateQuizSchema } from "@/lib/validators";
import { generateQuiz } from "@/lib/assessment-generation";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// POST /api/assessments/generate — generate a quiz from the question bank
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Generation writes an Assessment plus a row per question, so an unbounded
    // caller can inflate the database quickly.
    const limit = rateLimit({
      key: `generate:${session.user.id}`,
      limit: 20,
      windowSeconds: 60,
    });
    if (!limit.ok) return tooManyRequests(limit.retryAfterSeconds);

    const body = await req.json();
    const parsed = generateQuizSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const result = await generateQuiz(session.user.id, parsed.data);

    if (result === "subject-not-found") {
      return NextResponse.json({ error: "Subject not found." }, { status: 404 });
    }
    if (result === "topic-not-found") {
      return NextResponse.json({ error: "Topic not found." }, { status: 404 });
    }
    if (result === "no-questions") {
      return NextResponse.json(
        { error: "No questions found matching your criteria." },
        { status: 404 },
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error generating quiz:", error);
    return NextResponse.json(
      { error: "Failed to generate quiz" },
      { status: 500 },
    );
  }
}
