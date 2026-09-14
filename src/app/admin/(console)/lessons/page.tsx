import Link from "next/link";
import { requireAdminPage } from "@/lib/admin-session";
import { PageHeader } from "@/components/ui/page-header";
import { buttonClass } from "@/components/ui/button";
import { LessonFilterBar } from "@/components/admin/lesson-filter-bar";
import {
  AdminTable,
  AdminTd,
  AdminTh,
  AdminTr,
  HIDE_BELOW,
  SHOW_BELOW,
} from "@/components/admin/admin-table";
import { EmptyState } from "@/components/admin/empty-state";
import { normaliseFilter, type RawFilterParams } from "@/lib/admin-lesson-browse";
import { getAdminLessonBrowseData, type LessonTopicRow } from "@/lib/admin-data";
import { TERM_LABELS, type ClassLevel } from "@/lib/curriculum-scope";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

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
        <EmptyState
          title="Choose a subject"
          message="Pick a subject above to list its topics and see which have an authored lesson note."
        />
      ) : (
        <>
          <p className="mb-4 text-sm text-muted">
            <span className="font-semibold tabular-nums text-foreground">{authoredCount}</span> of{" "}
            <span className="tabular-nums">{rows.length}</span> {selectedSubjectName} topics have
            an authored lesson note.
          </p>

          <AdminTable caption={`${selectedSubjectName} topics and their lesson note status`}>
            <thead>
              <tr className="border-b border-border-strong bg-secondary/50">
                <AdminTh>Topic</AdminTh>
                <AdminTh className={HIDE_BELOW.sm}>Term</AdminTh>
                <AdminTh className={HIDE_BELOW.md}>Blocks</AdminTh>
                <AdminTh className={HIDE_BELOW.sm}>Status</AdminTh>
                <AdminTh align="right">Action</AdminTh>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <AdminTr>
                  <td colSpan={5} className="px-4 py-10 text-center text-muted">
                    No topics match this filter.
                  </td>
                </AdminTr>
              ) : (
                sections.map((section) => (
                  <Section key={section.classLevel} classLevel={section.classLevel} rows={section.rows} />
                ))
              )}
            </tbody>
          </AdminTable>
        </>
      )}
    </div>
  );
}

function Section({ classLevel, rows }: { classLevel: ClassLevel; rows: LessonTopicRow[] }) {
  return (
    <>
      <tr className="border-b border-border-strong bg-secondary/30">
        <th scope="colgroup" colSpan={5} className="px-4 py-2 text-left text-xs font-semibold text-foreground">
          {classLevel}
          <span className="ml-2 font-normal tabular-nums text-muted">
            {rows.length} topic{rows.length === 1 ? "" : "s"}
          </span>
        </th>
      </tr>
      {rows.map((row) => (
        <AdminTr key={row.topicId}>
          <AdminTd className="font-medium text-foreground">
            {row.topicTitle}
            <div
              className={cn(
                SHOW_BELOW.sm,
                "mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-normal text-muted",
              )}
            >
              <StatusPill authored={row.authored} />
              <span>{TERM_LABELS[row.term]}</span>
              <span className="tabular-nums">
                {row.blockCount} block{row.blockCount === 1 ? "" : "s"}
              </span>
            </div>
          </AdminTd>
          <AdminTd className={cn(HIDE_BELOW.sm, "whitespace-nowrap text-muted")}>
            {TERM_LABELS[row.term]}
          </AdminTd>
          <AdminTd className={cn(HIDE_BELOW.md, "tabular-nums text-muted")}>{row.blockCount}</AdminTd>
          <AdminTd className={HIDE_BELOW.sm}>
            <StatusPill authored={row.authored} />
          </AdminTd>
          <AdminTd align="right">
            <Link
              href={`/admin/lessons/upload?topicId=${row.topicId}`}
              className={buttonClass("outline", "sm")}
            >
              {row.authored ? "Replace" : "Upload"}
            </Link>
          </AdminTd>
        </AdminTr>
      ))}
    </>
  );
}

function StatusPill({ authored }: { authored: boolean }) {
  return (
    <span
      className={cn(
        "whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
        authored ? "bg-tone-green-soft text-tone-green-ink" : "bg-secondary text-muted",
      )}
    >
      {authored ? "Authored" : "Placeholder"}
    </span>
  );
}
