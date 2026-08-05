import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/page-header";
import { buttonClass } from "@/components/ui/button";
import { QuestionForm } from "@/components/admin/question-form";
import type { Prisma } from "@prisma/client";

/**
 * `Question.options` is a nullable Json column, so Prisma types it as
 * `Prisma.JsonValue` — it could be a string, number, array, or anything else
 * a stray write put there. Only a plain, non-array object of string values is
 * a valid options map; anything else is treated as absent rather than cast
 * blindly (which would otherwise crash the form on unexpected JSON).
 */
function toOptionsRecord(value: Prisma.JsonValue | null): Record<string, string> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const out: Record<string, string> = {};
  for (const [key, val] of Object.entries(value)) {
    out[key] = typeof val === "string" ? val : String(val);
  }
  return out;
}

export default async function EditQuestionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [question, subjects, topics] = await Promise.all([
    db.question.findUnique({
      where: { id },
      select: {
        id: true,
        subjectId: true,
        topicId: true,
        examType: true,
        examYear: true,
        questionNumber: true,
        questionText: true,
        questionImageUrl: true,
        questionType: true,
        options: true,
        correctAnswer: true,
        explanation: true,
        explanationImageUrl: true,
        difficulty: true,
        marks: true,
        timeEstimateSeconds: true,
      },
    }),
    db.subject.findMany({
      select: { id: true, name: true, code: true },
      orderBy: { name: "asc" },
    }),
    db.topic.findMany({
      select: { id: true, title: true, subjectId: true },
      orderBy: { title: "asc" },
    }),
  ]);

  if (!question) notFound();

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
        subjects={subjects}
        topics={topics}
        initial={{
          ...question,
          options: toOptionsRecord(question.options),
        }}
      />
    </div>
  );
}
