import Link from "next/link";
import { requireAdminPage } from "@/lib/admin-session";
import { getAdminOverview } from "@/lib/admin-data";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBanner } from "@/components/admin/status-banner";
import {
  AdminTable,
  AdminTd,
  AdminTh,
  AdminTr,
  TH_CLS,
} from "@/components/admin/admin-table";
import type { StatRow } from "@/lib/admin-stats";

export const dynamic = "force-dynamic";

export default async function AdminOverviewPage() {
  // The layout's check does not re-run on client-side navigation between admin
  // routes, so each page carries its own.
  await requireAdminPage();

  const {
    total,
    subjectCount,
    topicCount,
    unlinkedCount,
    subjectRows,
    codeBySubjectId,
    emptySubjects,
    examRows,
    difficultyRows,
    examYears,
  } = await getAdminOverview();

  const hasGaps = emptySubjects.length > 0 || unlinkedCount > 0;

  return (
    <div>
      <PageHeader
        title="Overview"
        description={`${total} questions across ${subjectCount} subjects, ${topicCount} topics.`}
      />

      {total === 0 ? (
        <StatusBanner
          tone="info"
          title="No questions yet"
          message="The question bank is empty. Import questions to start seeing coverage figures here."
          action={
            <Link
              href="/admin/questions/import"
              className="whitespace-nowrap rounded-lg border border-border-strong bg-card px-3 py-1.5 text-sm font-semibold text-foreground transition-colors hover:bg-secondary"
            >
              Import questions
            </Link>
          }
        />
      ) : (
        <div className="flex flex-col gap-8">
          <StatTable
            caption="Questions by subject"
            heading="By subject"
            rows={subjectRows}
            hrefFor={(key) => `/admin/questions?subjectId=${key}`}
            labelPrefix="subject"
            extraColumn="code"
            codeByKey={codeBySubjectId}
          />

          <StatTable
            caption="Questions by exam type"
            heading="By exam"
            rows={examRows}
            hrefFor={(key) => `/admin/questions?examType=${key}`}
            labelPrefix="exam type"
          />

          <StatTable
            caption="Questions by difficulty"
            heading="By difficulty"
            rows={difficultyRows}
            hrefFor={(key) => `/admin/questions?difficulty=${key}`}
            labelPrefix="difficulty"
          />

          <section>
            <h2 className={TH_CLS}>Exam years covered</h2>
            {examYears.length === 0 ? (
              <p className="mt-2 text-sm text-muted">None recorded</p>
            ) : (
              <ul className="mt-2 flex flex-wrap gap-2">
                {examYears.map((year) => (
                  <li key={year}>
                    <Link
                      href={`/admin/questions?examYear=${year}`}
                      aria-label={`Exam year ${year}: view in questions list`}
                      className="inline-block rounded-lg border border-border bg-secondary px-2.5 py-1 text-xs font-semibold tabular-nums text-foreground transition-colors hover:bg-secondary/70"
                    >
                      {year}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2 className={TH_CLS}>Gaps</h2>
            {!hasGaps ? (
              <StatusBanner
                tone="success"
                title="No coverage gaps detected."
                className="mt-2"
              />
            ) : (
              <div className="mt-2 flex flex-col gap-4">
                {emptySubjects.length > 0 && (
                  <div>
                    <p className="text-sm text-muted">
                      {emptySubjects.length}{" "}
                      {emptySubjects.length === 1 ? "subject has" : "subjects have"} zero
                      questions.
                    </p>
                    <ul className="mt-2 flex flex-wrap gap-2">
                      {emptySubjects.map((s) => (
                        <li key={s.id}>
                          <Link
                            href="/admin/questions/import"
                            className="inline-block rounded-lg border border-border-strong bg-card px-2.5 py-1 text-xs font-semibold text-foreground transition-colors hover:bg-secondary"
                          >
                            {s.name} ({s.code}) has no questions — import
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {unlinkedCount > 0 && (
                  <div>
                    <Link
                      href="/admin/questions"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border-strong bg-card px-3 py-1.5 text-sm font-semibold text-foreground transition-colors hover:bg-secondary"
                    >
                      <span className="tabular-nums">{unlinkedCount}</span>{" "}
                      {unlinkedCount === 1 ? "question is" : "questions are"} not linked to
                      a topic
                    </Link>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function StatTable({
  caption,
  heading,
  rows,
  hrefFor,
  labelPrefix,
  extraColumn,
  codeByKey,
}: {
  caption: string;
  heading: string;
  rows: StatRow[];
  hrefFor: (key: string) => string;
  labelPrefix: string;
  extraColumn?: "code";
  /** Subject code by subject id — only supplied for the by-subject table. */
  codeByKey?: Record<string, string>;
}) {
  return (
    <section>
      <h2 className={TH_CLS}>{heading}</h2>
      <AdminTable caption={caption} className="mt-2">
        <thead>
          <tr className="border-b border-border-strong">
            <AdminTh>Name</AdminTh>
            {extraColumn === "code" && <AdminTh>Code</AdminTh>}
            <AdminTh align="right">Count</AdminTh>
            <AdminTh align="right">Percent</AdminTh>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <AdminTr key={row.key}>
              <AdminTd>
                <Link
                  href={hrefFor(row.key)}
                  aria-label={`${row.label} (${labelPrefix}): ${row.count} questions, ${row.percent} percent of total — view in questions list`}
                  className="font-medium text-foreground hover:text-primary hover:underline"
                >
                  {row.label}
                </Link>
              </AdminTd>
              {extraColumn === "code" && (
                <AdminTd className="text-muted">{codeByKey?.[row.key]}</AdminTd>
              )}
              <AdminTd align="right" className="tabular-nums text-foreground">
                {row.count}
              </AdminTd>
              <AdminTd align="right">
                <div className="flex items-center justify-end gap-2">
                  <div
                    className="h-1.5 w-16 overflow-hidden rounded-lg bg-secondary"
                    aria-hidden
                  >
                    <div
                      className="h-full bg-primary"
                      style={{ width: `${row.percent}%` }}
                    />
                  </div>
                  <span className="tabular-nums text-muted">{row.percent}%</span>
                </div>
              </AdminTd>
            </AdminTr>
          ))}
        </tbody>
      </AdminTable>
    </section>
  );
}
