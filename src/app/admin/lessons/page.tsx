import Link from "next/link";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/page-header";
import { buttonClass } from "@/components/ui/button";
import { parseBlocks } from "@/lib/lesson-engine";
import { isAuthored } from "@/lib/admin-lesson";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const TH_CLS = "text-[11px] font-semibold uppercase tracking-wider text-muted";

export default async function AdminLessonsPage() {
  const subjects = await db.subject.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      topics: {
        orderBy: { orderIndex: "asc" },
        select: {
          id: true,
          title: true,
          subtopics: {
            orderBy: { orderIndex: "asc" },
            take: 1,
            select: {
              lessons: { take: 1, select: { blocks: true, createdBy: true } },
            },
          },
        },
      },
    },
  });

  const rows = subjects.flatMap((subject) =>
    subject.topics.map((topic) => {
      const lesson = topic.subtopics[0]?.lessons[0] ?? null;
      return {
        subjectName: subject.name,
        topicId: topic.id,
        topicTitle: topic.title,
        blockCount: lesson ? parseBlocks(lesson.blocks).length : 0,
        authored: lesson ? isAuthored(lesson.createdBy) : false,
      };
    }),
  );

  const authoredCount = rows.filter((r) => r.authored).length;

  return (
    <div>
      <PageHeader
        title="Lessons"
        description="Upload a markdown lesson note against a topic. Uploaded notes replace the generated placeholder."
      />

      <p className="mb-4 text-sm text-muted">
        <span className="font-semibold tabular-nums text-foreground">{authoredCount}</span> of{" "}
        <span className="tabular-nums">{rows.length}</span> topics have an authored lesson note.
      </p>

      <div className="overflow-x-auto rounded-lg border border-border-strong bg-card">
        <table className="w-full text-sm">
          <caption className="sr-only">Topics and their lesson note status</caption>
          <thead>
            <tr className="border-b border-border-strong bg-secondary/50">
              <th scope="col" className={cn(TH_CLS, "px-4 py-3 text-left")}>Subject</th>
              <th scope="col" className={cn(TH_CLS, "px-4 py-3 text-left")}>Topic</th>
              <th scope="col" className={cn(TH_CLS, "px-4 py-3 text-left")}>Blocks</th>
              <th scope="col" className={cn(TH_CLS, "px-4 py-3 text-left")}>Status</th>
              <th scope="col" className={cn(TH_CLS, "px-4 py-3 text-right")}>Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-strong">
            {rows.map((row) => (
              <tr key={row.topicId}>
                <td className="px-4 py-3 text-muted">{row.subjectName}</td>
                <td className="px-4 py-3 font-medium text-foreground">{row.topicTitle}</td>
                <td className="px-4 py-3 tabular-nums text-muted">{row.blockCount}</td>
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
                      row.authored
                        ? "bg-tone-green-soft text-tone-green-ink"
                        : "bg-secondary text-muted",
                    )}
                  >
                    {row.authored ? "Authored" : "Placeholder"}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/admin/lessons/upload?topicId=${row.topicId}`}
                    className={buttonClass("outline", "sm")}
                  >
                    {row.authored ? "Replace" : "Upload"}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
