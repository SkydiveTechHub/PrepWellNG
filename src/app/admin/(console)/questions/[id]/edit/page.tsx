import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/admin-session";
import { getQuestionForEdit } from "@/lib/admin-data";
import { PageHeader } from "@/components/ui/page-header";
import { buttonClass } from "@/components/ui/button";
import { QuestionForm } from "@/components/admin/question-form";

export default async function EditQuestionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // The layout's check does not re-run on client-side navigation between admin
  // routes, so each page carries its own.
  await requireAdminPage();

  const { id } = await params;

  const data = await getQuestionForEdit(id);
  if (!data) notFound();

  return (
    <div>
      <PageHeader
        title="Edit question"
        action={
          <Link href="/admin/questions" className={buttonClass("outline", "md")}>
            Back to questions
          </Link>
        }
      />
      <QuestionForm
        mode="edit"
        subjects={data.subjects}
        topics={data.topics}
        initial={data.question}
      />
    </div>
  );
}
