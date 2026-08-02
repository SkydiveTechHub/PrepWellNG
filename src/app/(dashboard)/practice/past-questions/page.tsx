import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { PastQuestionPicker } from "@/components/practice/past-question-picker";
import { PageHeader } from "@/components/ui/page-header";

export default async function PastQuestionsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const track = (session.user as { track?: string | null }).track ?? null;

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Past Questions"
        description="Pick an exam, a subject, then a year. Three quick steps to your next practice session."
      />

      <PastQuestionPicker track={track} />
    </div>
  );
}
