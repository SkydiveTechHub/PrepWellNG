import type { ExamType } from "@prisma/client";
import { db } from "./db";
import { computePlanWindow, generatePlan } from "@/engines/planner/plan";
import { computePathState } from "./learning-path";
import { loadRevisionExtras } from "@/engines/learning/revision";
import { relevantTrackCategories } from "./subjects";
import { daysUntil } from "./navigation";

export type StudyPlanSubject = {
  id: string;
  name: string;
  code: string;
  slug: string;
};

export type StudyPlanItemData = {
  id: string;
  scheduledDate: string;
  subjectId: string;
  activityType: string;
  durationMinutes: number;
  status: string;
  notes: string | null;
  subject: { name: string; code: string; slug: string };
};

export type StudyPlanData = {
  id: string;
  targetExam: string;
  targetDate: string;
  dailyStudyHours: number;
  runwayStart: string;
  items: StudyPlanItemData[];
};

export type StudyPlanPageData = {
  plan: StudyPlanData | null;
  subjects: StudyPlanSubject[];
  /** Computed server-side so SSR and hydration agree on the countdown. */
  daysRemaining: number | null;
};

export async function getStudyPlanPageData(
  userId: string,
): Promise<StudyPlanPageData> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { track: true },
  });

  const [plan, subjects] = await Promise.all([
    db.studyPlan.findFirst({
      where: { studentId: userId, isActive: true },
      orderBy: { createdAt: "desc" },
      include: {
        items: {
          orderBy: { scheduledDate: "asc" },
          include: {
            subject: { select: { name: true, code: true, slug: true } },
          },
        },
      },
    }),
    db.subject.findMany({
      where: { trackCategory: { in: [...relevantTrackCategories(user?.track)] } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, code: true, slug: true },
    }),
  ]);

  return {
    // Dates go out as ISO strings: the payload has to survive JSON, and this
    // one already crosses a client boundary.
    plan: plan
      ? {
          id: plan.id,
          targetExam: plan.targetExam,
          targetDate: plan.targetDate.toISOString(),
          dailyStudyHours: plan.dailyStudyHours,
          runwayStart: computePlanWindow(
            plan.createdAt,
            plan.targetDate,
          ).runwayStart.toISOString(),
          items: plan.items.map((item) => ({
            id: item.id,
            scheduledDate: item.scheduledDate.toISOString(),
            subjectId: item.subjectId,
            activityType: item.activityType,
            durationMinutes: item.durationMinutes,
            status: item.status,
            notes: item.notes,
            subject: item.subject,
          })),
        }
      : null,
    subjects,
    daysRemaining: plan ? daysUntil(plan.targetDate) : null,
  };
}

/** How long one scheduled study session runs. */
const SESSION_MINUTES = 30;

const planInclude = {
  items: {
    orderBy: { scheduledDate: "asc" },
    include: { subject: { select: { name: true, code: true, slug: true } } },
  },
} as const;

/**
 * The active plan with its items, as `GET /api/study-plan` returns it. Distinct
 * from `getStudyPlanPageData`, which reshapes into the client component's DTO.
 */
export async function getActiveStudyPlan(userId: string) {
  const plan = await db.studyPlan.findFirst({
    where: { studentId: userId, isActive: true },
    include: planInclude,
    orderBy: { createdAt: "desc" },
  });
  if (!plan) return null;

  return {
    ...plan,
    runwayStart: computePlanWindow(plan.createdAt, plan.targetDate)
      .runwayStart.toISOString(),
  };
}

export type GenerateStudyPlanInput = {
  targetExam: ExamType;
  targetDate: string;
  subjectIds: string[];
  dailyStudyHours: number;
};

/**
 * Builds a fresh plan and retires any previously active one.
 *
 * Returns `"no-subjects"` when none of the requested subject ids resolve, so
 * the caller can answer 404 without inspecting the result shape.
 */
export async function generateStudyPlanFor(
  userId: string,
  input: GenerateStudyPlanInput,
) {
  const { targetExam, targetDate, subjectIds, dailyStudyHours } = input;

  const subjects = await db.subject.findMany({
    where: { id: { in: subjectIds } },
    select: { id: true, name: true, code: true },
  });
  if (subjects.length === 0) return "no-subjects" as const;

  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(targetDate);
  end.setHours(23, 59, 59, 999);

  const totalDays = Math.max(
    1,
    Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)),
  );

  await db.studyPlan.updateMany({
    where: { studentId: userId, isActive: true },
    data: { isActive: false },
  });

  const plan = await db.studyPlan.create({
    data: {
      studentId: userId,
      targetExam,
      targetDate: end,
      subjectIds,
      dailyStudyHours,
    },
  });

  // Derive the combined graph + per-topic mastery/retention state, plus the DB
  // half of the revision queue (SRS + cadence), then run the planner.
  const { graph, state, pretestPassed } = await computePathState(
    db,
    userId,
    subjectIds,
  );
  const revisionExtras = await loadRevisionExtras(db, userId, graph);

  const drafts = generatePlan({
    graph,
    state,
    subjectIds,
    start,
    targetDate: end,
    dailyMinutes: Math.round(dailyStudyHours * 60),
    revisionExtras,
    subjectNames: Object.fromEntries(subjects.map((s) => [s.id, s.name])),
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
    include: planInclude,
  });

  const runwayStart = computePlanWindow(plan.createdAt, end).runwayStart;

  return {
    plan: fullPlan ? { ...fullPlan, runwayStart: runwayStart.toISOString() } : null,
    subjects,
    totalDays,
    totalSessions: items.length,
  };
}
