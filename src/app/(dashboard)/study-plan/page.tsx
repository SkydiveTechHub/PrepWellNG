import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { computePlanWindow } from "@/engines/planner/plan";
import { relevantTrackCategories } from "@/lib/subjects";
import { daysUntil } from "@/lib/navigation";
import { StudyPlanView } from "@/components/study-plan/study-plan-view";

// Server-rendered. This used to fire two client fetches on mount (the plan and
// the subject list) behind a full-page spinner.
export default async function StudyPlanPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { track: true },
  });

  const [plan, subjects] = await Promise.all([
    db.studyPlan.findFirst({
      where: { studentId: session.user.id, isActive: true },
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

  // Serialised for the client boundary: Dates do not survive as Date objects.
  const initialPlan = plan
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
    : null;

  // Computed here so SSR and hydration agree on the countdown.
  const initialDaysRemaining = plan ? daysUntil(plan.targetDate) : null;

  return (
    <StudyPlanView
      initialPlan={initialPlan}
      subjects={subjects}
      initialDaysRemaining={initialDaysRemaining}
    />
  );
}
