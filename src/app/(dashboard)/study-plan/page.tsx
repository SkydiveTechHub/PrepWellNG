import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getStudyPlanPageData } from "@/lib/study-plan";
import { StudyPlanView } from "@/components/study-plan/study-plan-view";

// Server-rendered. This used to fire two client fetches on mount (the plan and
// the subject list) behind a full-page spinner.
export default async function StudyPlanPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { plan, subjects, daysRemaining } = await getStudyPlanPageData(
    session.user.id,
  );

  return (
    <StudyPlanView
      initialPlan={plan}
      subjects={subjects}
      initialDaysRemaining={daysRemaining}
    />
  );
}
