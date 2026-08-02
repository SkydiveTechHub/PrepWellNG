import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { generateStudyPlanSchema } from "@/lib/validators";
import { computePathState } from "@/lib/learning-path";
import {
  generatePlan,
  computePlanWindow,
} from "@/engines/planner/plan";
import { loadRevisionExtras } from "@/engines/learning/revision";

export const dynamic = "force-dynamic";

const SESSION_MINUTES = 30;

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

    if (!plan) return NextResponse.json({ plan: null });

    const runwayStart = computePlanWindow(
      plan.createdAt,
      plan.targetDate,
    ).runwayStart;

    return NextResponse.json({
      plan: { ...plan, runwayStart: runwayStart.toISOString() },
    });
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

    // Derive the combined graph + per-topic mastery/retention state, plus the
    // DB half of the revision queue (SRS + cadence), then run the planner.
    const studyMinutes = Math.round(dailyStudyHours * 60);
    const { graph, state, pretestPassed } = await computePathState(
      db,
      session.user.id,
      subjectIds,
    );
    const revisionExtras = await loadRevisionExtras(db, session.user.id, graph);
    const subjectNames = Object.fromEntries(
      subjects.map((subject) => [subject.id, subject.name]),
    );

    const drafts = generatePlan({
      graph,
      state,
      subjectIds,
      start,
      targetDate: end,
      dailyMinutes: studyMinutes,
      revisionExtras,
      subjectNames,
      sessionMinutes: SESSION_MINUTES,
      pretestPassed,
    });

    const items = drafts.map((draft) => ({
      studyPlanId: plan.id,
      scheduledDate: draft.date,
      subjectId: draft.subjectId,
      topicId: draft.topicId,
      activityType: draft.activityType as
        | "LESSON"
        | "PRACTICE"
        | "REVISION"
        | "PAST_QUESTIONS"
        | "MOCK_EXAM",
      durationMinutes: draft.durationMinutes,
      notes: draft.notes,
    }));

    if (items.length > 0) {
      await db.studyPlanItem.createMany({ data: items });
    }

    const fullPlan = await db.studyPlan.findUnique({
      where: { id: plan.id },
      include: {
        items: {
          orderBy: { scheduledDate: "asc" },
          include: { subject: { select: { name: true, code: true, slug: true } } },
        },
      },
    });

    const runwayStart = computePlanWindow(plan.createdAt, end).runwayStart;

    return NextResponse.json({
      plan: fullPlan ? { ...fullPlan, runwayStart: runwayStart.toISOString() } : null,
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
