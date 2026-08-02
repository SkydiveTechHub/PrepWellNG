import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
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

    const lesson = await db.lesson.findUnique({
      where: { id: lessonId },
      include: {
        subtopic: {
          include: { topic: { select: { subjectId: true } } },
        },
      },
    });
    if (!lesson) {
      return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
    }

    const subjectId = lesson.subtopic.topic.subjectId;
    const topicId = lesson.subtopic.topicId;
    const { status, completionPercent, checkpointData, masteryScore, timeSpentMinutes } =
      parsed.data;

    const data = {
      ...(status !== undefined && { status }),
      ...(completionPercent !== undefined && { completionPercent }),
      ...(checkpointData !== undefined && { checkpointData }),
      ...(masteryScore !== undefined && { masteryScore }),
      ...(timeSpentMinutes !== undefined && { timeSpentMinutes }),
      lastAccessedAt: new Date(),
    };

    const progress = await db.studentProgress.upsert({
      where: {
        studentId_subjectId_topicId_lessonId: {
          studentId: session.user.id,
          subjectId,
          topicId,
          lessonId,
        },
      },
      create: {
        studentId: session.user.id,
        subjectId,
        topicId,
        lessonId,
        status: status ?? "IN_PROGRESS",
        completionPercent: completionPercent ?? 0,
        ...(checkpointData !== undefined && { checkpointData }),
        ...(masteryScore !== undefined && { masteryScore }),
        ...(timeSpentMinutes !== undefined && { timeSpentMinutes }),
        lastAccessedAt: new Date(),
      },
      update: data,
    });

    return NextResponse.json({ progress });
  } catch (error) {
    console.error("Error updating lesson progress:", error);
    return NextResponse.json(
      { error: "Failed to update progress" },
      { status: 500 },
    );
  }
}
