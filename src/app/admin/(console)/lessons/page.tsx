import Link from "next/link";
import { requireAdminPage } from "@/lib/admin-session";
import { PageHeader } from "@/components/ui/page-header";
import { buttonClass } from "@/components/ui/button";
import { LessonFilterBar } from "@/components/admin/lesson-filter-bar";
import { normaliseFilter, type RawFilterParams } from "@/lib/admin-lesson-browse";
import { getAdminLessonBrowseData, type LessonTopicRow } from "@/lib/admin-data";
import { TERM_LABELS, type ClassLevel } from "@/lib/curriculum-scope";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const TH_CLS = "text-[11px] font-semibold uppercase tracking-wider text-muted";

export default async function AdminLessonsPage({
  searchParams,
}: {
  searchParams: Promise<RawFilterParams>;
}) {
  // The layout's check does not re-run on client-side navigation between admin
  // routes, so each page carries its own.
  await requireAdminPage();

  const filter = normaliseFilter(await searchParams);

  const {
    subjects,
    rows,
    sections,
    classLevels,
    terms,
    authoredCount,
    selectedSubjectName,
  } = await getAdminLessonBrowseData(filter);

  return (
    <div>
      <PageHeader
        title="Lessons"
        description="Upload a markdown lesson note against a topic. Uploaded notes replace the generated placeholder."
        action={
          <Link href="/admin/lessons/upload" className={buttonClass("primary", "md")}>
            Upload note
          </Link>
        }
      />

      <LessonFilterBar
        subjects={subjects}
        filter={filter}
        classLevels={classLevels}
        terms={terms}
      />

      {!filter.subjectId ? (
        <p className="rounded-lg border border-dashed border-border-strong bg-card px-4 py-10 text-center text-sm text-muted">
          Choose a subject to list its topics.
        </p>
      ) : (
        <>
          <p className="mb-4 text-sm text-muted">
            <span className="font-semibold tabular-nums text-foreground">{authoredCount}</span> of{" "}
            <span className="tabular-nums">{rows.length}</span> {selectedSubjectName} topics have
            an authored lesson note.
          </p>

          <div className="overflow-x-auto rounded-lg border border-border-strong bg-card">
            <table className="w-full text-sm">
              <caption className="sr-only">
                {selectedSubjectName} topics and their lesson note status
              </caption>
              <thead>
                <tr className="border-b border-border-strong bg-secondary/50">
                  <th scope="col" className={cn(TH_CLS, "px-4 py-3 text-left")}>Topic</th>
                  <th scope="col" className={cn(TH_CLS, "px-4 py-3 text-left")}>Term</th>
                  <th scope="col" className={cn(TH_CLS, "px-4 py-3 text-left")}>Blocks</th>
                  <th scope="col" className={cn(TH_CLS, "px-4 py-3 text-left")}>Status</th>
                  <th scope="col" className={cn(TH_CLS, "px-4 py-3 text-right")}>Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-strong">
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-muted">
                      No topics match this filter.
                    </td>
                  </tr>
                ) : (
                  sections.map((section) => (
                    <Section key={section.classLevel} classLevel={section.classLevel} rows={section.rows} />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function Section({ classLevel, rows }: { classLevel: ClassLevel; rows: LessonTopicRow[] }) {
  return (
    <>
      <tr className="bg-secondary/30">
        <th scope="colgroup" colSpan={5} className="px-4 py-2 text-left text-xs font-semibold text-foreground">
          {classLevel}
          <span className="ml-2 font-normal tabular-nums text-muted">
            {rows.length} topic{rows.length === 1 ? "" : "s"}
          </span>
        </th>
      </tr>
      {rows.map((row) => (
        <tr key={row.topicId}>
          <td className="px-4 py-3 font-medium text-foreground">{row.topicTitle}</td>
          <td className="px-4 py-3 text-muted">{TERM_LABELS[row.term]}</td>
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
    </>
  );
}
