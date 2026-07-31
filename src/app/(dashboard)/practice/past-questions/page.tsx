import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { PastQuestionPicker } from "@/components/practice/past-question-picker";

export default async function PastQuestionsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const track = (session.user as { track?: string | null }).track ?? null;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Past Questions</h1>
        <p className="text-muted mt-1">
          Pick an exam, a subject, then a year.
        </p>
      </div>

      <PastQuestionPicker track={track} />
    </div>
  );
}
