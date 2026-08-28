import { redirect } from "next/navigation";
import Link from "next/link";
import { LuTarget, LuChevronRight } from "react-icons/lu";
import { auth } from "@/lib/auth";
import { getSubjectChoices, getSubjectPerformance } from "@/lib/analytics/subject-view";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonClass } from "@/components/ui/button";
import { SubjectChips } from "@/components/performance/subject-chips";
import { VerdictBand } from "@/components/performance/verdict-band";
import { InsightList } from "@/components/performance/insight-list";
import { TopicGroupList } from "@/components/performance/topic-group-list";
import { ProfileBand } from "@/components/performance/profile-band";

export default async function SubjectPerformancePage({
  searchParams,
}: {
  searchParams: Promise<{ subject?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { subject: requested } = await searchParams;
  const choices = await getSubjectChoices(session.user.id);

  if (choices.length === 0) {
    return (
      <EmptyState
        tone="primary"
        icon={<LuTarget className="h-6 w-6" />}
        title="Nothing to analyse yet"
        description="Answer some questions and this page will show you which topics are weak, which have faded, and which you've never proven."
        action={
          <Link href="/practice/past-questions" className={buttonClass("primary", "lg")}>
            Start Practicing
            <LuChevronRight className="h-4 w-4" />
          </Link>
        }
      />
    );
  }

  // Weakest-first ordering makes choices[0] the subject that most needs looking at.
  const activeSlug =
    choices.find((choice) => choice.slug === requested)?.slug ?? choices[0].slug;
  // An unrecognised ?subject= would otherwise leave the URL naming one subject
  // while the page shows another — a shared link that quietly lies. Redirect so
  // the URL and the content agree. No ?subject= at all is not a mismatch.
  if (requested !== undefined && requested !== activeSlug) {
    redirect(`/performance/subjects?subject=${encodeURIComponent(activeSlug)}`);
  }
  const data = await getSubjectPerformance(session.user.id, activeSlug);
  if (!data) redirect("/performance/subjects");

  return (
    <>
      <SubjectChips subjects={choices} activeSlug={activeSlug} />

      <VerdictBand subjectName={data.subject.name} verdict={data.verdict} />
      <InsightList insights={data.insights} />

      <h2 className="section-label mt-8 mb-1">Topics</h2>
      <TopicGroupList
        title="Needs work"
        blurb="Measured, and weak. These are your real weaknesses."
        rows={data.groups.NEEDS_WORK}
        group="NEEDS_WORK"
        subjectSlug={data.subject.slug}
        defaultOpen
      />
      <TopicGroupList
        title="Needs revision"
        blurb="You knew these and they've faded."
        rows={data.groups.NEEDS_REVISION}
        group="NEEDS_REVISION"
        subjectSlug={data.subject.slug}
      />
      <TopicGroupList
        title="Coming along"
        blurb="Real progress, not finished yet."
        rows={data.groups.COMING_ALONG}
        group="COMING_ALONG"
        subjectSlug={data.subject.slug}
      />
      <TopicGroupList
        title="Unproven"
        blurb="Not weaknesses — unknowns. You haven't answered enough here to say."
        rows={data.groups.UNPROVEN}
        group="UNPROVEN"
        subjectSlug={data.subject.slug}
      />
      <TopicGroupList
        title="Solid"
        blurb="Strong. Anything marked stale is worth a quick review."
        rows={data.groups.SOLID}
        group="SOLID"
        subjectSlug={data.subject.slug}
      />

      <h2 className="section-label mt-8 mb-1">How you answer</h2>
      <ProfileBand profile={data.profile} />
    </>
  );
}
