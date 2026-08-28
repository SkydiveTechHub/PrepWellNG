import { NextRequest, NextResponse, after } from "next/server";
import { auth } from "@/lib/auth";
import { submitAssessmentSchema } from "@/lib/validators";
import { submitAttempt } from "@/lib/assessment-submit";
import { awardAchievements } from "@/lib/achievements";
import { recordTopicPracticeResult } from "@/lib/topic-practice-result";

export const dynamic = "force-dynamic";

// POST /api/assessments/submit — grade an attempt and return the results.
//
// Idempotent: submitting an already-completed attempt replays the stored result
// instead of failing. A student who double-taps Submit, or retries after a
// flaky connection, must never be told their work was lost.
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const studentId = session.user.id;

    const body = await req.json();
    const parsed = submitAssessmentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { attemptId, answers, practiceExit } = parsed.data;

    const outcome = await submitAttempt(studentId, attemptId, answers, awayEvents);

    if (outcome.outcome === "not-found") {
      return NextResponse.json(
        { error: "Assessment attempt not found." },
        { status: 404 },
      );
    }

    if (outcome.outcome === "expired") {
      return NextResponse.json(
        {
          error:
            "This attempt expired and can no longer accept answers. Please start a new attempt.",
        },
        { status: 409 },
      );
    }

    if (outcome.outcome === "graded") {
      // `after()` keeps the work inside the request lifetime. Fire-and-forget
      // promises are dropped when a serverless function freezes on response, so
      // achievements silently stopped being awarded in production.
      after(async () => {
        try {
          await awardAchievements(studentId);
        } catch (error) {
          console.error("Achievement check failed:", error);
        }
      });
    }

    // The lesson practice exit earns completion, mastery and a ledger event.
    // This used to happen while rendering the result page, where a refresh
    // re-recorded the attempt; grading is the write, so it belongs here. It runs
    // on a replay too — recording is idempotent per attempt, and a student whose
    // first submit was graded before a retry must still get their progress.
    if (practiceExit) {
      after(async () => {
        try {
          const recorded = await recordTopicPracticeResult(
            studentId,
            practiceExit.subjectSlug,
            practiceExit.topicSlug,
            attemptId,
          );
          if (recorded.status !== "ok") {
            console.error(
              `Practice exit not recorded (${recorded.status}) for attempt ${attemptId}`,
            );
          }
        } catch (error) {
          console.error("Practice exit recording failed:", error);
        }
      });
    }

    return NextResponse.json(outcome.result);
  } catch (error) {
    console.error("Error submitting assessment:", error);
    return NextResponse.json(
      { error: "Failed to submit assessment" },
      { status: 500 },
    );
  }
}
