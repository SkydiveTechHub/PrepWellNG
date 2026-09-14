import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isEntitled, tierOfSession } from "@/lib/entitlements";
import { requiredTierFor } from "@/lib/subscription";
import { PageHeader } from "@/components/ui/page-header";
import { UpgradePrompt } from "@/components/billing/upgrade-prompt";
import { getStudyPlanPageData } from "@/lib/study-plan";
import { StudyPlanView } from "@/components/study-plan/study-plan-view";
import { ReminderOptInCard } from "@/components/study-plan/reminder-opt-in-card";

const DESCRIPTION =
  "A realistic weekly schedule that keeps you in step with your class — and gets you exam-ready when it's time.";

export default async function StudyPlanPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  if (!(await isEntitled(session.user.id, tierOfSession(session), "studyPlanner"))) {
    return (
      <div className="space-y-8">
        <PageHeader title="Study plan" description={DESCRIPTION} />
        <UpgradePrompt
          feature="The study planner"
          requiredTier={requiredTierFor("studyPlanner")}
          description="Get a week-by-week plan that follows your school term, fills the gaps you've missed, and moves missed sessions instead of letting them pile up."
        />
      </div>
    );
  }

  const data = await getStudyPlanPageData(session.user.id);

  return (
    <>
      {data.plan && <ReminderOptInCard />}
      <StudyPlanView data={data} />
    </>
  );
}
