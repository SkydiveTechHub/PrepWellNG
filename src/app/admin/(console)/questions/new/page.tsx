import Link from "next/link";
import { requireAdminPage } from "@/lib/admin-session";
import { getQuestionFormOptions } from "@/lib/admin-data";
import { PageHeader } from "@/components/ui/page-header";
import { buttonClass } from "@/components/ui/button";
import { QuestionForm } from "@/components/admin/question-form";

export default async function NewQuestionPage() {
  // The layout's check does not re-run on client-side navigation between admin
  // routes, so each page carries its own.
  await requireAdminPage();

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
