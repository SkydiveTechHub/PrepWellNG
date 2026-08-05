import Link from "next/link";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBanner } from "@/components/admin/status-banner";
import { summariseSubjects, toStatRows, type StatRow } from "@/lib/admin-stats";

export const dynamic = "force-dynamic";

const HEADING_CLS = "text-[11px] font-semibold uppercase tracking-wider text-muted";

export default async function AdminOverviewPage() {
  const [subjects, topicCount, unlinkedCount, byExam, byDifficulty, years] =
    await Promise.all([
      db.subject.findMany({
        select: {
          id: true,
          name: true,
          code: true,
          _count: { select: { questions: true } },
        },
        orderBy: { name: "asc" },
      }),
      db.topic.count(),
      db.question.count({ where: { topicId: null } }),
      db.question.groupBy({ by: ["examType"], _count: { _all: true } }),
      db.question.groupBy({ by: ["difficulty"], _count: { _all: true } }),
      db.question.findMany({
        where: { examYear: { not: null } },
        distinct: ["examYear"],
        select: { examYear: true },
        orderBy: { examYear: "desc" },
      }),
    ]);

  const summary = summariseSubjects(
    subjects.map((s) => ({
      id: s.id,
      name: s.name,
      code: s.code,
      questionCount: s._count.questions,
    })),
  );

  const examRows = toStatRows(
    byExam.map((r) => ({ key: r.examType, label: r.examType, count: r._count._all })),
    summary.total,
  );
  const difficultyRows = toStatRows(
    byDifficulty.map((r) => ({ key: r.difficulty, label: r.difficulty, count: r._count._all })),
    summary.total,
  );

  const hasGaps = summary.empty.length > 0 || unlinkedCount > 0;

  return (
    <div>
      <PageHeader
        title="Overview"
        description={`${summary.total} questions across ${subjects.length} subjects, ${topicCount} topics.`}
      />

      {summary.total === 0 ? (
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
            rows={summary.rows}
            hrefFor={(key) => `/admin/questions?subjectId=${key}`}
            labelPrefix="subject"
            extraColumn="code"
            subjects={subjects}
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
            <h2 className={HEADING_CLS}>Exam years covered</h2>
            {years.length === 0 ? (
              <p className="mt-2 text-sm text-muted">None recorded</p>
            ) : (
              <ul className="mt-2 flex flex-wrap gap-2">
                {years.map((y) => (
                  <li key={y.examYear}>
                    <Link
                      href={`/admin/questions?examYear=${y.examYear}`}
                      className="inline-block rounded-lg border border-border bg-secondary px-2.5 py-1 text-xs font-semibold tabular-nums text-foreground transition-colors hover:bg-secondary/70"
                    >
                      {y.examYear}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2 className={HEADING_CLS}>Gaps</h2>
            {!hasGaps ? (
              <StatusBanner
                tone="success"
                title="No coverage gaps detected."
                className="mt-2"
              />
            ) : (
              <div className="mt-2 flex flex-col gap-4">
                {summary.empty.length > 0 && (
                  <div>
                    <p className="text-sm text-muted">
                      {summary.empty.length}{" "}
                      {summary.empty.length === 1 ? "subject has" : "subjects have"} zero
                      questions.
                    </p>
                    <ul className="mt-2 flex flex-wrap gap-2">
                      {summary.empty.map((s) => (
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
  subjects,
}: {
  caption: string;
  heading: string;
  rows: StatRow[];
  hrefFor: (key: string) => string;
  labelPrefix: string;
  extraColumn?: "code";
  subjects?: Array<{ id: string; code: string }>;
}) {
  const codeByKey = new Map(subjects?.map((s) => [s.id, s.code]));

  return (
    <section>
      <h2 className={HEADING_CLS}>{heading}</h2>
      <div className="mt-2 overflow-hidden rounded-lg border border-border-strong bg-card">
        <table className="w-full text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b border-border-strong">
              <th scope="col" className={`px-4 py-2.5 text-left ${HEADING_CLS}`}>
                Name
              </th>
              {extraColumn === "code" && (
                <th scope="col" className={`px-4 py-2.5 text-left ${HEADING_CLS}`}>
                  Code
                </th>
              )}
              <th scope="col" className={`px-4 py-2.5 text-right ${HEADING_CLS}`}>
                Count
              </th>
              <th scope="col" className={`px-4 py-2.5 text-right ${HEADING_CLS}`}>
                Percent
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="border-b border-border-strong last:border-0">
                <td className="px-4 py-2.5">
                  <Link
                    href={hrefFor(row.key)}
                    aria-label={`${row.label} (${labelPrefix}): ${row.count} questions, ${row.percent} percent of total — view in questions list`}
                    className="font-medium text-foreground hover:text-primary hover:underline"
                  >
                    {row.label}
                  </Link>
                </td>
                {extraColumn === "code" && (
                  <td className="px-4 py-2.5 text-muted">{codeByKey.get(row.key)}</td>
                )}
                <td className="px-4 py-2.5 text-right tabular-nums text-foreground">
                  {row.count}
                </td>
                <td className="px-4 py-2.5 text-right">
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
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
