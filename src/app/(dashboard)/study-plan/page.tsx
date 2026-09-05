import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isEntitled, tierOfSession } from "@/lib/entitlements";
import { requiredTierFor } from "@/lib/subscription";
import { PageHeader } from "@/components/ui/page-header";
import { UpgradePrompt } from "@/components/billing/upgrade-prompt";
import { getStudyPlanPageData } from "@/lib/study-plan";
import { StudyPlanView } from "@/components/study-plan/study-plan-view";

// Server-rendered. This used to fire two client fetches on mount (the plan and
// the subject list) behind a full-page spinner.
export default async function StudyPlanPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  if (!(await isEntitled(session.user.id, tierOfSession(session), "studyPlanner"))) {
    return (
      <div className="space-y-8">
        <PageHeader
          title="Study plan"
          description="A schedule built around your exam date and your weakest topics."
        />
        <UpgradePrompt
          feature="The study planner"
          requiredTier={requiredTierFor("studyPlanner")}
          description="Get a day-by-day plan weighted to the topics that carry the most marks, and to the ones you keep getting wrong."
        />
      </div>
    );
  }

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
