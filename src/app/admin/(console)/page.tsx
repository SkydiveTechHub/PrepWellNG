import Link from "next/link";
import { LuCalendarX, LuCircleAlert, LuLink2Off, LuRefreshCw } from "react-icons/lu";
import type { IconType } from "react-icons";
import { requireAdminPage } from "@/lib/admin-session";
import { getAdminOverview } from "@/lib/admin-data";
import { getAdminAnalytics } from "@/lib/admin-analytics-data";
import {
  Bar,
  CARD,
  FunnelCard,
  GrowthCharts,
  KpiOverview,
  MonthlyTable,
  RenewalsCard,
  RevenueChart,
  SectionHeading,
  SegmentCard,
} from "@/components/admin/analytics-panel";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBanner } from "@/components/admin/status-banner";
import {
  AdminTable,
  AdminTd,
  AdminTh,
  AdminTr,
  TH_CLS,
  HIDE_BELOW,
  SHOW_BELOW,
} from "@/components/admin/admin-table";
import { cn } from "@/lib/utils";
import { formatNaira } from "@/lib/subscription";
import type { StatRow } from "@/lib/admin-stats";
import { listAcademicTerms } from "@/lib/academic-terms";
import { hasTermCoverage } from "@/engines/planner/term-context";
import { lagosDayKey } from "@/lib/streak";

export const dynamic = "force-dynamic";

const asOf = new Intl.DateTimeFormat("en-NG", {
  timeZone: "Africa/Lagos",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * Read top to bottom, the page answers: what needs me today, how is the
 * business doing, where is it heading, who are the students, and is there
 * enough content for them. Each section is ranked by how often an admin acts
 * on it.
 */
export default async function AdminOverviewPage() {
  // The layout's check does not re-run on client-side navigation between admin
  // routes, so each page carries its own.
  await requireAdminPage();

  // Independent reads — the pooler is slow to hand out connections, so
  // waiting on one before starting the next multiplies the page's latency.
  const now = new Date();
  const [overview, analytics, terms] = await Promise.all([
    getAdminOverview(),
    getAdminAnalytics(now),
    listAcademicTerms(),
  ]);
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
  } = overview;
  const { renewals, series } = analytics;

  const termsCovered = hasTermCoverage(terms, lagosDayKey(now));

  const attention: AttentionItem[] = [];
  if (renewals.dueThisWeek > 0) {
    attention.push({
      icon: LuRefreshCw,
      text: `${renewals.dueThisWeek} paying ${plural(renewals.dueThisWeek, "subscriber's term ends", "subscribers' terms end")} within 7 days`,
      detail: `${formatNaira(renewals.dueSoonKobo)} is up for renewal over the next 30 days.`,
    });
  }
  if (!termsCovered) {
    attention.push({
      icon: LuCalendarX,
      text: "No academic term set for today or the next 30 days",
      detail: "Study plans fall back to the approximate national calendar.",
      href: "/admin/terms",
      cta: "Set term dates",
    });
  }
  if (emptySubjects.length > 0) {
    attention.push({
      icon: LuCircleAlert,
      text: `${emptySubjects.length} ${plural(emptySubjects.length, "subject has", "subjects have")} no questions`,
      detail: emptySubjects.map((s) => s.name).join(", "),
      href: "/admin/questions/import",
      cta: "Import questions",
    });
  }
  if (unlinkedCount > 0) {
    attention.push({
      icon: LuLink2Off,
      text: `${unlinkedCount} ${plural(unlinkedCount, "question is", "questions are")} not linked to a topic`,
      detail: "They are left out of topic practice and study plans.",
      href: "/admin/questions",
      cta: "Review",
    });
  }

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        className="mb-0 md:mb-0"
        title="Overview"
        description="Business health, student engagement and question bank coverage."
        action={
          <p className="text-xs text-muted">
            Figures as of <time dateTime={now.toISOString()}>{asOf.format(now)}</time> WAT
          </p>
        }
      />

      {attention.length > 0 && <AttentionList items={attention} />}

      <section aria-labelledby="kpi-heading">
        <SectionHeading
          id="kpi-heading"
          title="At a glance"
          description="This month so far, against the same stretch of last month."
        />
        <KpiOverview data={analytics} />
      </section>

      <section aria-labelledby="trends-heading">
        <SectionHeading
          id="trends-heading"
          title="Revenue and growth"
          description="The last 12 months. The faded bar is the current month, still in progress."
        />
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <RevenueChart series={series} />
          </div>
          <RenewalsCard renewals={renewals} />
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <GrowthCharts series={series} />
        </div>
        <div className="mt-4">
          <MonthlyTable series={series} />
        </div>
      </section>

      <section aria-labelledby="students-heading">
        <SectionHeading
          id="students-heading"
          title="Students"
          description="Where new students drop off, and which groups already pay."
        />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <div className="md:col-span-2 xl:col-span-1">
            <FunnelCard funnel={analytics.funnel} />
          </div>
          <SegmentCard
            id="class-heading"
            title="By class"
            description="Headcount, and the share on a paid plan."
            column="Class"
            segments={analytics.byClassLevel}
          />
          <SegmentCard
            id="state-heading"
            title="By state"
            description="The six largest states; the rest are grouped."
            column="State"
            segments={analytics.byState}
          />
        </div>
      </section>

      <section aria-labelledby="bank-heading">
        <SectionHeading
          id="bank-heading"
          title="Question bank"
          description="Coverage of the content students practise on."
          aside={
            <Link href="/admin/questions" className="font-semibold text-primary hover:underline">
              All questions
            </Link>
          }
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
          <div className="flex flex-col gap-4">
            <dl className={cn(CARD, "grid grid-cols-2 sm:grid-cols-4")}>
              <BankStat label="Questions" value={total} />
              <BankStat label="Subjects" value={subjectCount} />
              <BankStat label="Topics" value={topicCount} />
              <BankStat label="Exam years" value={examYears.length} />
            </dl>

            <div className="grid gap-4 xl:grid-cols-3">
              <div className="xl:col-span-2">
                <StatTable
                  caption="Questions by subject"
                  rows={subjectRows}
                  hrefFor={(key) => `/admin/questions?subjectId=${key}`}
                  labelPrefix="subject"
                  extraColumn="code"
                  codeByKey={codeBySubjectId}
                />
              </div>
              <div className="grid content-start gap-4 md:grid-cols-2 xl:grid-cols-1">
                <Breakdown
                  heading="By exam"
                  rows={examRows}
                  hrefFor={(key) => `/admin/questions?examType=${key}`}
                  labelPrefix="exam type"
                />
                <Breakdown
                  heading="By difficulty"
                  rows={difficultyRows}
                  hrefFor={(key) => `/admin/questions?difficulty=${key}`}
                  labelPrefix="difficulty"
                />
                <section className={cn(CARD, "p-4 md:col-span-2 xl:col-span-1")}>
                  <h3 className={TH_CLS}>Exam years covered</h3>
                  {examYears.length === 0 ? (
                    <p className="mt-2 text-sm text-muted">None recorded</p>
                  ) : (
                    <ul className="mt-2 flex flex-wrap gap-1.5">
                      {examYears.map((year) => (
                        <li key={year}>
                          <Link
                            href={`/admin/questions?examYear=${year}`}
                            aria-label={`Exam year ${year}: view in questions list`}
                            className="inline-block rounded-lg border border-border bg-secondary px-2 py-0.5 text-xs font-semibold tabular-nums text-foreground transition-colors hover:bg-secondary/70"
                          >
                            {year}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>
            </div>

            {emptySubjects.length === 0 && unlinkedCount === 0 && (
              <StatusBanner tone="success" title="No coverage gaps detected." />
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function plural(n: number, one: string, many: string) {
  return n === 1 ? one : many;
}

type AttentionItem = {
  icon: IconType;
  text: string;
  detail?: string;
  href?: string;
  cta?: string;
};

/** Only what an admin can act on today. Absent entirely when there is nothing. */
function AttentionList({ items }: { items: AttentionItem[] }) {
  return (
    <section aria-labelledby="attention-heading" className="rounded-lg border border-warning/30 bg-warning-soft">
      <h2
        id="attention-heading"
        className="border-b border-warning/20 px-4 py-2.5 text-sm font-bold text-warning"
      >
        Needs attention
      </h2>
      <ul className="divide-y divide-warning/20">
        {items.map((item) => (
          <li key={item.text} className="flex flex-wrap items-start gap-x-3 gap-y-2 px-4 py-3">
            <item.icon className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">{item.text}</p>
              {item.detail && <p className="mt-0.5 text-sm text-muted">{item.detail}</p>}
            </div>
            {item.href && (
              <Link
                href={item.href}
                className="ml-7 whitespace-nowrap rounded-lg border border-border-strong bg-card px-3 py-1.5 text-sm font-semibold text-foreground transition-colors hover:bg-secondary sm:ml-0"
              >
                {item.cta}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function BankStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="border-border-strong p-4 [&:nth-child(-n+2)]:border-b [&:nth-child(odd)]:border-r sm:border-r sm:last:border-r-0 sm:[&:nth-child(-n+2)]:border-b-0">
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd className="mt-0.5 text-lg font-bold text-foreground">{value.toLocaleString("en-NG")}</dd>
    </div>
  );
}

/** A short categorical split — a few rows, so bars beat a full table. */
function Breakdown({
  heading,
  rows,
  hrefFor,
  labelPrefix,
}: {
  heading: string;
  rows: StatRow[];
  hrefFor: (key: string) => string;
  labelPrefix: string;
}) {
  return (
    <section className={cn(CARD, "p-4")}>
      <h3 className={TH_CLS}>{heading}</h3>
      <ul className="mt-3 flex flex-col gap-2.5">
        {rows.map((row) => (
          <li key={row.key}>
            <Link
              href={hrefFor(row.key)}
              aria-label={`${row.label} (${labelPrefix}): ${row.count} questions, ${row.percent} percent of total — view in questions list`}
              className="group block"
            >
              <span className="flex items-baseline justify-between gap-2 text-xs">
                <span className="font-medium text-foreground group-hover:text-primary group-hover:underline">
                  {row.label}
                </span>
                <span className="tabular-nums text-muted">
                  <span className="font-semibold text-foreground">{row.count.toLocaleString("en-NG")}</span> ·{" "}
                  {row.percent}%
                </span>
              </span>
              <Bar pct={row.percent} className="mt-1 h-1.5" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function StatTable({
  caption,
  rows,
  hrefFor,
  labelPrefix,
  extraColumn,
  codeByKey,
}: {
  caption: string;
  rows: StatRow[];
  hrefFor: (key: string) => string;
  labelPrefix: string;
  extraColumn?: "code";
  /** Subject code by subject id — only supplied for the by-subject table. */
  codeByKey?: Record<string, string>;
}) {
  return (
    <section>
      <AdminTable caption={caption}>
        <thead>
          <tr className="border-b border-border-strong">
            <AdminTh>Subject</AdminTh>
            {extraColumn === "code" && <AdminTh className={HIDE_BELOW.sm}>Code</AdminTh>}
            <AdminTh align="right">Questions</AdminTh>
            <AdminTh align="right">Share</AdminTh>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <AdminTr key={row.key}>
              <AdminTd>
                <Link
                  href={hrefFor(row.key)}
                  aria-label={`${row.label} (${labelPrefix}): ${row.count} questions, ${row.percent} percent of total — view in questions list`}
                  className={cn(
                    "font-medium hover:text-primary hover:underline",
                    row.count === 0 ? "text-muted" : "text-foreground",
                  )}
                >
                  {row.label}
                </Link>
                {extraColumn === "code" && codeByKey?.[row.key] && (
                  <span className={cn(SHOW_BELOW.sm, "ml-1.5 text-xs text-muted")}>
                    {codeByKey[row.key]}
                  </span>
                )}
              </AdminTd>
              {extraColumn === "code" && (
                <AdminTd className={cn(HIDE_BELOW.sm, "text-muted")}>{codeByKey?.[row.key]}</AdminTd>
              )}
              <AdminTd align="right" className="tabular-nums text-foreground">
                {row.count.toLocaleString("en-NG")}
              </AdminTd>
              <AdminTd align="right">
                <div className="flex items-center justify-end gap-2">
                  <Bar pct={row.percent} className="hidden h-1.5 w-20 sm:block" />
                  <span className="w-9 tabular-nums text-muted">{row.percent}%</span>
                </div>
              </AdminTd>
            </AdminTr>
          ))}
        </tbody>
      </AdminTable>
    </section>
  );
}
