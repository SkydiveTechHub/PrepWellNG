import Link from "next/link";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/page-header";
import { buttonClass } from "@/components/ui/button";
import { QuestionForm } from "@/components/admin/question-form";

export default async function NewQuestionPage() {
  const [subjects, topics] = await Promise.all([
    db.subject.findMany({
      select: { id: true, name: true, code: true },
      orderBy: { name: "asc" },
    }),
    db.topic.findMany({
      select: { id: true, title: true, subjectId: true },
      orderBy: { title: "asc" },
    }),
  ]);

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
