import { LuArrowDownRight, LuArrowUpRight, LuMinus } from "react-icons/lu";
import { FUNNEL_DAYS, type AdminAnalytics } from "@/lib/admin-analytics-data";
import {
  percentChange,
  type Comparison,
  type MonthlyPoint,
  type RenewalHealth,
  type Segment,
} from "@/lib/admin-analytics";
import { formatNaira } from "@/lib/subscription";
import { cn } from "@/lib/utils";
import {
  AdminTable,
  AdminTd,
  AdminTh,
  AdminTr,
  HIDE_BELOW,
  TH_CLS,
} from "@/components/admin/admin-table";
import { MonthlyBarChart, SubscribersChart } from "@/components/admin/analytics-charts";

/**
 * The business half of the admin dashboard, as sections the page lays out:
 * headline tiles, a year of trends, renewals, the signup funnel and the
 * student mix. Every figure a chart draws is also in the monthly table, so
 * the charts can stay decorative to screen readers.
 */

const num = (n: number) => n.toLocaleString("en-NG");

export const CARD = "rounded-lg border border-border-strong bg-card";

export function SectionHeading({
  id,
  title,
  description,
  aside,
}: {
  id: string;
  title: string;
  description?: string;
  aside?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
      <div className="min-w-0">
        <h2 id={id} className="text-base font-bold text-foreground">
          {title}
        </h2>
        {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
      </div>
      {aside && <div className="text-xs text-muted">{aside}</div>}
    </div>
  );
}

// ─── Headline ─────────────────────────────────────────────

/**
 * Four figures that answer "how is the business doing", then four that explain
 * them. Month-to-date flows are compared with the same stretch of last month;
 * stocks with where they stood a month ago.
 */
export function KpiOverview({ data }: { data: AdminAnalytics }) {
  const { kpis, series, renewals } = data;
  const complete = series.filter((p) => p.complete);
  const conversionPts = kpis.conversion.current - kpis.conversion.previous;
  const comps = kpis.subscribers.current - kpis.subscribers.paid;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 xl:grid-cols-4">
        <KpiTile
          label="Revenue, month to date"
          value={formatNaira(kpis.revenueKobo.current)}
          comparison={kpis.revenueKobo}
          formatPrevious={formatNaira}
          trend={complete.map((p) => p.revenueKobo)}
        />
        <KpiTile
          label="Active subscribers"
          value={num(kpis.subscribers.current)}
          comparison={kpis.subscribers}
          note={`${num(kpis.subscribers.paid)} paying${comps > 0 ? ` · ${num(comps)} complimentary` : ""}`}
          // A stock: the month in progress is a real reading, so it stays in.
          trend={series.map((p) => p.subscribers)}
        />
        <KpiTile
          label="New students, month to date"
          value={num(kpis.signups.current)}
          comparison={kpis.signups}
          trend={complete.map((p) => p.signups)}
        />
        <KpiTile
          label="Active learners, month to date"
          value={num(kpis.activeLearners.current)}
          comparison={kpis.activeLearners}
          note="Any practice, lesson or review"
          trend={complete.map((p) => p.activeLearners)}
        />
      </div>

      <dl className={cn(CARD, "grid grid-cols-2 lg:grid-cols-4")}>
        <MiniStat label="Total students" value={num(kpis.students.current)}>
          <Delta change={kpis.students.change} unit="%" />
          <span className="text-muted">in a month</span>
        </MiniStat>
        <MiniStat label="Subscribed share" value={`${kpis.conversion.current}%`}>
          <Delta change={conversionPts} unit=" pts" />
          <span className="text-muted">vs {kpis.conversion.previous}%</span>
        </MiniStat>
        <MiniStat
          label="Renewal rate, last 30 days"
          value={renewals.renewalRate === null ? "—" : `${renewals.renewalRate}%`}
        >
          <span className="text-muted">
            {renewals.renewed + renewals.lapsed === 0
              ? "No terms ended"
              : `${num(renewals.renewed)} renewed · ${num(renewals.lapsed)} lapsed`}
          </span>
        </MiniStat>
        <MiniStat label="Assessments, month to date" value={num(kpis.assessments.current)}>
          <Delta change={kpis.assessments.change} unit="%" />
          <span className="text-muted">vs {num(kpis.assessments.previous)}</span>
        </MiniStat>
      </dl>
    </div>
  );
}

function KpiTile({
  label,
  value,
  comparison,
  note,
  trend,
  formatPrevious = num,
}: {
  label: string;
  value: string;
  comparison: Comparison;
  note?: string;
  trend: number[];
  formatPrevious?: (n: number) => string;
}) {
  return (
    <div className={cn(CARD, "flex flex-col p-4")}>
      <p className="text-xs font-medium text-muted">{label}</p>
      <div className="mt-1 flex items-end justify-between gap-3">
        {/* Proportional figures: tabular digits look loose at display size. */}
        <p className="min-w-0 break-words text-2xl font-bold tracking-tight text-foreground">
          {value}
        </p>
        <Sparkline values={trend} />
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 text-xs">
        <Delta change={comparison.change} unit="%" />
        <span className="text-muted">vs {formatPrevious(comparison.previous)} last month</span>
      </div>
      {note && <p className="mt-1 text-[11px] text-muted">{note}</p>}
    </div>
  );
}

function MiniStat({
  label,
  value,
  children,
}: {
  label: string;
  value: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-border-strong p-4 [&:nth-child(-n+2)]:border-b [&:nth-child(odd)]:border-r lg:border-r lg:last:border-r-0 lg:[&:nth-child(-n+2)]:border-b-0">
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd className="mt-0.5 text-lg font-bold text-foreground">{value}</dd>
      <dd className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs">{children}</dd>
    </div>
  );
}

/**
 * Shape only — no axis, no values. The tile's number and the monthly table
 * carry the figures, so this is hidden from screen readers.
 */
function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const w = 80;
  const h = 28;
  const pad = 3;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const points = values.map((v, i) => [
    pad + (i / (values.length - 1)) * (w - pad * 2),
    // A flat series sits mid-height rather than on the floor.
    max === min ? h / 2 : h - pad - ((v - min) / span) * (h - pad * 2),
  ]);
  const d = points.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const [lx, ly] = points[points.length - 1];

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="shrink-0" aria-hidden>
      <path
        d={d}
        fill="none"
        stroke="var(--color-primary)"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.55}
      />
      <circle cx={lx} cy={ly} r={3} fill="var(--color-primary)" />
    </svg>
  );
}

/** Direction carries an icon and a sign, never colour alone. */
function Delta({ change, unit }: { change: number | null; unit: string }) {
  if (change === null) {
    return <span className="font-semibold text-muted">New</span>;
  }
  if (change === 0) {
    return (
      <span className="inline-flex items-center gap-0.5 font-semibold text-muted">
        <LuMinus className="h-3.5 w-3.5" aria-hidden />
        No change
      </span>
    );
  }
  const up = change > 0;
  const Icon = up ? LuArrowUpRight : LuArrowDownRight;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 font-semibold tabular-nums",
        up ? "text-success" : "text-danger",
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {up ? "+" : "−"}
      {Math.abs(change)}
      {unit}
    </span>
  );
}

// ─── Trends ───────────────────────────────────────────────

export function RevenueChart({ series }: { series: MonthlyPoint[] }) {
  return (
    <MonthlyBarChart
      series={series}
      dataKey="revenueKobo"
      title="Revenue"
      name="Revenue"
      money
      tall
    />
  );
}

export function GrowthCharts({ series }: { series: MonthlyPoint[] }) {
  return (
    <>
      <SubscribersChart series={series} />
      <MonthlyBarChart series={series} dataKey="signups" title="New students" name="New students" />
      <MonthlyBarChart
        series={series}
        dataKey="activeLearners"
        title="Active learners"
        name="Active learners"
      />
    </>
  );
}

export function RenewalsCard({ renewals }: { renewals: RenewalHealth }) {
  return (
    <section aria-labelledby="renewals-heading" className={cn(CARD, "flex flex-col p-4")}>
      <h3 id="renewals-heading" className="text-sm font-semibold text-foreground">
        Renewals, next 30 days
      </h3>
      <p className="mt-0.5 text-xs text-muted">
        Terms are prepaid and do not auto-renew.
      </p>

      <p className="mt-4 text-3xl font-bold tracking-tight text-foreground">
        {formatNaira(renewals.dueSoonKobo)}
      </p>
      <p className="text-xs text-muted">revenue up for renewal</p>

      <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-4 text-sm">
        <div>
          <dt className="text-xs text-muted">Subscribers due</dt>
          <dd className="text-lg font-bold text-foreground">{num(renewals.dueSoon)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Due within 7 days</dt>
          <dd className="text-lg font-bold text-foreground">{num(renewals.dueThisWeek)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Renewed, last 30 days</dt>
          <dd className="text-lg font-bold text-foreground">{num(renewals.renewed)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Lapsed, last 30 days</dt>
          <dd className="text-lg font-bold text-foreground">{num(renewals.lapsed)}</dd>
        </div>
      </dl>

      <p className="mt-auto pt-4 text-xs text-muted">
        {renewals.renewalRate === null
          ? "No paid term ended in the last 30 days."
          : `${renewals.renewalRate}% of subscribers whose term ended in the last 30 days paid again.`}
      </p>
    </section>
  );
}

// ─── Students ─────────────────────────────────────────────

export function FunnelCard({ funnel }: { funnel: AdminAnalytics["funnel"] }) {
  const steps = [
    { label: "Signed up", count: funnel.signedUp },
    { label: "Practised at least once", count: funnel.practised },
    { label: "Completed an assessment", count: funnel.assessed },
    { label: "Paid for a plan", count: funnel.paid },
  ];
  const pct = (n: number) => (funnel.signedUp > 0 ? Math.round((n / funnel.signedUp) * 100) : 0);
  const neverPractised = funnel.signedUp - funnel.practised;

  return (
    <section aria-labelledby="funnel-heading" className={cn(CARD, "flex flex-col p-4")}>
      <h3 id="funnel-heading" className="text-sm font-semibold text-foreground">
        New student journey
      </h3>
      <p className="mt-0.5 text-xs text-muted">
        Students who signed up in the last {FUNNEL_DAYS} days, and how far they got.
      </p>

      {funnel.signedUp === 0 ? (
        <p className="mt-4 text-sm text-muted">No signups in this period.</p>
      ) : (
        <>
          <ol className="mt-4 flex flex-col gap-3">
            {steps.map((step) => (
              <li key={step.label}>
                <div className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="text-foreground">{step.label}</span>
                  <span className="tabular-nums text-muted">
                    <span className="font-semibold text-foreground">{num(step.count)}</span> ·{" "}
                    {pct(step.count)}%
                  </span>
                </div>
                <Bar pct={pct(step.count)} className="mt-1 h-2" />
              </li>
            ))}
          </ol>
          {neverPractised > 0 && (
            <p className="mt-auto pt-4 text-xs text-muted">
              <span className="font-semibold text-foreground">
                {pct(neverPractised)}% never practised
              </span>{" "}
              — {num(neverPractised)} students signed up but have not answered a question.
            </p>
          )}
        </>
      )}
    </section>
  );
}

/**
 * Headcount and the share on a paid tier, per segment. The share is what
 * tells marketing where the product already sells.
 */
export function SegmentCard({
  id,
  title,
  description,
  segments,
  column,
}: {
  id: string;
  title: string;
  description: string;
  segments: Segment[];
  column: string;
}) {
  const rows = segments.filter((s) => s.students > 0);
  const top = Math.max(1, ...rows.map((s) => s.students));

  return (
    <section aria-labelledby={id} className={cn(CARD, "p-4")}>
      <h3 id={id} className="text-sm font-semibold text-foreground">
        {title}
      </h3>
      <p className="mt-0.5 text-xs text-muted">{description}</p>

      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-muted">No students yet.</p>
      ) : (
        <table className="mt-3 w-full text-xs">
          <caption className="sr-only">{title}</caption>
          <thead>
            <tr>
              <th scope="col" className={cn(TH_CLS, "pb-1.5 text-left")}>
                {column}
              </th>
              <th scope="col" className={cn(TH_CLS, "pb-1.5 text-right")}>
                Students
              </th>
              <th scope="col" className={cn(TH_CLS, "pb-1.5 pl-3 text-right")}>
                Subscribed
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.label}>
                <td className="py-1.5 pr-3">
                  <span className="block truncate text-foreground">{s.label}</span>
                  <Bar pct={(s.students / top) * 100} className="mt-1 h-1.5" />
                </td>
                <td className="py-1.5 text-right align-top tabular-nums text-foreground">
                  {num(s.students)}
                </td>
                <td className="py-1.5 pl-3 text-right align-top tabular-nums text-muted">
                  {s.conversion}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export function Bar({ pct, className }: { pct: number; className?: string }) {
  return (
    <div className={cn("overflow-hidden rounded-lg bg-secondary", className)} aria-hidden>
      <div
        className="h-full rounded-lg bg-primary"
        style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
      />
    </div>
  );
}

// ─── Table view ───────────────────────────────────────────

/**
 * The same figures as the charts, month by month. Collapsed by default — it
 * is the reference view, not the headline — but always in the document.
 */
export function MonthlyTable({ series }: { series: MonthlyPoint[] }) {
  // Newest first: the month an admin is asking about is almost always this one.
  const rows = series.map((point, i) => ({ point, prior: series[i - 1] })).reverse();

  return (
    <details className="group">
      <summary className="inline-flex cursor-pointer select-none items-center gap-1.5 rounded-lg text-sm font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
        <span className="inline-block transition-transform group-open:rotate-90" aria-hidden>
          ›
        </span>
        Monthly figures as a table
      </summary>
      <AdminTable caption="Growth, subscription and activity figures by month" className="mt-3">
        <thead>
          <tr className="border-b border-border-strong">
            <AdminTh>Month</AdminTh>
            <AdminTh align="right">Revenue</AdminTh>
            <AdminTh align="right">Subscribers</AdminTh>
            <AdminTh align="right">New students</AdminTh>
            <AdminTh align="right" className={HIDE_BELOW.md}>Total students</AdminTh>
            <AdminTh align="right" className={HIDE_BELOW.lg}>Active learners</AdminTh>
            <AdminTh align="right" className={HIDE_BELOW.lg}>Assessments</AdminTh>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ point, prior }) => (
            <AdminTr key={point.month}>
              <AdminTd className="whitespace-nowrap font-medium text-foreground">{point.label}</AdminTd>
              <Cell
                value={formatNaira(point.revenueKobo)}
                now={point.revenueKobo}
                prior={prior?.revenueKobo}
                point={point}
              />
              <Cell value={num(point.subscribers)} now={point.subscribers} prior={prior?.subscribers} point={point} />
              <Cell value={num(point.signups)} now={point.signups} prior={prior?.signups} point={point} />
              <AdminTd align="right" className={cn(HIDE_BELOW.md, "tabular-nums text-foreground")}>
                {num(point.totalUsers)}
              </AdminTd>
              <AdminTd align="right" className={cn(HIDE_BELOW.lg, "tabular-nums text-foreground")}>
                {num(point.activeLearners)}
              </AdminTd>
              <AdminTd align="right" className={cn(HIDE_BELOW.lg, "tabular-nums text-foreground")}>
                {num(point.assessmentsCompleted)}
              </AdminTd>
            </AdminTr>
          ))}
        </tbody>
      </AdminTable>
      <p className="mt-2 text-xs text-muted">
        Change is against the previous month. The current month is left out of the
        comparison until it closes. Subscribers are counted at each month&apos;s close.
      </p>
    </details>
  );
}

function Cell({
  value,
  now,
  prior,
  point,
}: {
  value: string;
  now: number;
  prior: number | undefined;
  point: MonthlyPoint;
}) {
  // A partial month against a whole one only ever reads as a drop.
  const change = point.complete && prior !== undefined ? percentChange(now, prior) : undefined;
  return (
    <AdminTd align="right" className="tabular-nums text-foreground">
      <span className="whitespace-nowrap">{value}</span>
      {change !== undefined && (
        <span className="block text-[11px]">
          <Delta change={change} unit="%" />
        </span>
      )}
    </AdminTd>
  );
}

