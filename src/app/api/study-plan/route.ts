import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { generateStudyPlanSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

const ACTIVITY_TYPES = [
  "LESSON",
  "PRACTICE",
  "REVISION",
  "PAST_QUESTIONS",
] as const;

const activityLabels: Record<string, string> = {
  LESSON: "Study lesson",
  PRACTICE: "Practice questions",
  REVISION: "Revision",
  PAST_QUESTIONS: "Past questions",
};

// GET /api/study-plan — get the active study plan with items
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const plan = await db.studyPlan.findFirst({
      where: { studentId: session.user.id, isActive: true },
      include: {
        items: {
          orderBy: { scheduledDate: "asc" },
          include: { subject: { select: { name: true, code: true, slug: true } } },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ plan });
  } catch (error) {
    console.error("Error fetching study plan:", error);
    return NextResponse.json(
      { error: "Failed to fetch study plan" },
      { status: 500 }
    );
  }
}

// POST /api/study-plan — generate a new study plan
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const parsed = generateStudyPlanSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { targetExam, targetDate, subjectIds, dailyStudyHours } = parsed.data;

    // Verify subjects exist
    const subjects = await db.subject.findMany({
      where: { id: { in: subjectIds } },
      select: { id: true, name: true, code: true },
    });
    if (subjects.length === 0) {
      return NextResponse.json({ error: "No valid subjects found" }, { status: 404 });
    }

    // Calculate study days
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(targetDate);
    end.setHours(23, 59, 59, 999);

    const totalDays = Math.max(
      1,
      Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
    );

    // Deactivate any existing active plans
    await db.studyPlan.updateMany({
      where: { studentId: session.user.id, isActive: true },
      data: { isActive: false },
    });

    // Create the plan
    const plan = await db.studyPlan.create({
      data: {
        studentId: session.user.id,
        targetExam,
        targetDate: end,
        subjectIds,
        dailyStudyHours,
      },
    });

    // Generate daily items
    const items: Array<{
      studyPlanId: string;
      scheduledDate: Date;
      subjectId: string;
      activityType: "LESSON" | "PRACTICE" | "REVISION" | "PAST_QUESTIONS" | "MOCK_EXAM";
      durationMinutes: number;
    }> = [];

    const studyMinutes = Math.round(dailyStudyHours * 60);
    const slotsPerDay = Math.max(1, Math.min(4, Math.floor(studyMinutes / 30)));

    for (let day = 0; day < totalDays; day++) {
      const date = new Date(start);
      date.setDate(date.getDate() + day);
      if (date > end) break;

      for (let slot = 0; slot < slotsPerDay; slot++) {
        const subjectIdx = (day * slotsPerDay + slot) % subjects.length;
        const activityIdx = (day * slotsPerDay + slot) % ACTIVITY_TYPES.length;
        items.push({
          studyPlanId: plan.id,
          scheduledDate: date,
          subjectId: subjects[subjectIdx].id,
          activityType: ACTIVITY_TYPES[activityIdx] as "LESSON" | "PRACTICE" | "REVISION" | "PAST_QUESTIONS" | "MOCK_EXAM",
          durationMinutes: Math.round(studyMinutes / slotsPerDay),
        });
      }
    }

    await db.studyPlanItem.createMany({ data: items });

    const fullPlan = await db.studyPlan.findUnique({
      where: { id: plan.id },
      include: {
        items: {
          orderBy: { scheduledDate: "asc" },
          include: { subject: { select: { name: true, code: true, slug: true } } },
        },
      },
    });

    return NextResponse.json({
      plan: fullPlan,
      subjects: subjects.map((s) => ({ id: s.id, name: s.name, code: s.code })),
      totalDays,
      totalSessions: items.length,
    });
  } catch (error) {
    console.error("Error generating study plan:", error);
    return NextResponse.json(
      { error: "Failed to generate study plan" },
      { status: 500 }
    );
  }
}
