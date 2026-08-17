import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  gradePretest,
  hasAlreadyPassedPretest,
  loadPretestTopic,
  startPretest,
} from "@/lib/pretest";

export const dynamic = "force-dynamic";

// Readiness pretest — 5 questions, ≥80% passes, self-certifies a topic so the
// student can skip the lesson grind (spec algorithm B, Stage 1).
// POST /api/learning-path/topics/[topicId]/pretest
//   {}                      → start: pick 5 objective questions, create an attempt
//   { attemptId, answers }  → grade: complete the attempt, record pretestPassedAt on ≥80%
// See docs/superpowers/specs/2026-08-02-learning-path-engine-design.md
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ topicId: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { topicId } = await params;
    const topic = await loadPretestTopic(topicId);
    if (!topic) {
      return NextResponse.json({ error: "Topic not found" }, { status: 404 });
    }

    const alreadyPassed = await hasAlreadyPassedPretest(
      session.user.id,
      topic.subjectId,
      topic.id,
    );

    const body = await req.json().catch(() => ({}));
    const { attemptId, answers } = body;

    // ── Start a fresh pretest ───────────────────────────────────────────────
    if (!attemptId) {
      const started = await startPretest(session.user.id, topic, alreadyPassed);
      if (started === "no-questions") {
        return NextResponse.json(
          { error: "No questions available for a pretest." },
          { status: 404 },
        );
      }
      return NextResponse.json(started);
    }

    // ── Grade the attempt ───────────────────────────────────────────────────
    if (!Array.isArray(answers)) {
      return NextResponse.json({ error: "Invalid submission." }, { status: 400 });
    }

    const graded = await gradePretest(
      session.user.id,
      topic,
      attemptId,
      answers,
      alreadyPassed,
    );
    if (graded === "attempt-not-found") {
      return NextResponse.json(
        { error: "Pretest attempt not found or already submitted." },
        { status: 404 },
      );
    }

    return NextResponse.json(graded);
  } catch (error) {
    console.error("Error handling readiness pretest:", error);
    return NextResponse.json(
      { error: "Failed to handle readiness pretest" },
      { status: 500 },
    );
  }
}
