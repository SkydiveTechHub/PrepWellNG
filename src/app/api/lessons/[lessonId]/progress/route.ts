import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { saveLessonProgress } from "@/lib/lesson-progress";
import { updateLessonProgressSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

// PATCH /api/lessons/[lessonId]/progress
// Persists the lesson player's checkpoint state (visited cards, knowledge-check
// results) and derived progress fields onto the student's StudentProgress row.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ lessonId: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { lessonId } = await params;

    const body = await req.json();
    const parsed = updateLessonProgressSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const progress = await saveLessonProgress(
      session.user.id,
      lessonId,
      parsed.data,
    );
    if (progress === "lesson-not-found") {
      return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
    }

    return NextResponse.json({ progress });
  } catch (error) {
    console.error("Error updating lesson progress:", error);
    return NextResponse.json(
      { error: "Failed to update progress" },
      { status: 500 },
    );
  }
}
