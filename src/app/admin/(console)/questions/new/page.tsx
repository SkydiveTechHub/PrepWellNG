import Link from "next/link";
import { getQuestionFormOptions } from "@/lib/admin-data";
import { PageHeader } from "@/components/ui/page-header";
import { buttonClass } from "@/components/ui/button";
import { QuestionForm } from "@/components/admin/question-form";

export default async function NewQuestionPage() {
  const { subjects, topics } = await getQuestionFormOptions();

  return (
    <div>
      <PageHeader
        title="New question"
        action={
          <Link href="/admin/questions" className={buttonClass("outline", "md")}>
            Back to questions
          </Link>
        }
      />
      <QuestionForm mode="create" subjects={subjects} topics={topics} />
    </div>
  );
}
