"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { MonthlyPoint } from "@/lib/admin-analytics";
import { shortMonthLabel } from "@/lib/admin-analytics";
import { formatNaira } from "@/lib/subscription";

/**
 * Month-by-month charts for the admin dashboard. One measure per chart, on
 * one axis: signups and totals differ by orders of magnitude, so putting them
 * on a shared plot would flatten one of them into a line along the floor.
 *
 * The current month is still accruing, so its bar is drawn at half strength
 * and its tooltip says "(to date)" — otherwise every month-to-date bar reads
 * as a collapse.
 */

type NumericKey = {
  [K in keyof MonthlyPoint]: MonthlyPoint[K] extends number ? K : never;
}[keyof MonthlyPoint];

const AXIS_TICK = { fontSize: 11, fill: "var(--color-muted)" };
const PARTIAL_OPACITY = 0.45;

const TOOLTIP_STYLE = {
  borderRadius: 8,
  border: "1px solid var(--color-border-strong)",
  background: "var(--color-card)",
  color: "var(--color-foreground)",
  fontSize: 12,
};

function withShortLabel(series: MonthlyPoint[]) {
  return series.map((p) => ({ ...p, short: shortMonthLabel(p.month) }));
}

function ChartFrame({
  title,
  summary,
  tall = false,
  children,
}: {
  title: string;
  /** Taller plot, for the lead chart in a wide slot. */
  tall?: boolean;
  /** Visible headline figure, so the chart is never the only carrier. */
  summary: string;
  children: React.ReactNode;
}) {
  return (
    <figure className="flex h-full flex-col rounded-lg border border-border-strong bg-card p-4">
      <figcaption className="mb-3 flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold text-foreground">{title}</span>
        <span className="text-xs tabular-nums text-muted">{summary}</span>
      </figcaption>
      {/* The monthly comparison table below carries the same figures for
          screen readers, so the SVG itself is decorative to them. */}
      <div className={tall ? "h-64 w-full flex-1 lg:h-auto lg:min-h-64" : "h-52 w-full"} aria-hidden>
        {children}
      </div>
    </figure>
  );
}

function tooltipLabel(_: unknown, payload: readonly { payload?: MonthlyPoint }[]) {
  return payload?.[0]?.payload?.label ?? "";
}

export function MonthlyBarChart({
  series,
  dataKey,
  title,
  name,
  money = false,
  tall = false,
}: {
  series: MonthlyPoint[];
  dataKey: NumericKey;
  title: string;
  name: string;
  money?: boolean;
  tall?: boolean;
}) {
  const data = withShortLabel(series);
  const format = (v: number) => (money ? formatNaira(v) : v.toLocaleString("en-NG"));
  const latest = series.at(-1);

  return (
    <ChartFrame
      title={title}
      tall={tall}
      summary={
        tall
          ? `${format(series.reduce((sum, p) => sum + p[dataKey], 0))} over 12 months`
          : latest
            ? `${format(latest[dataKey])} so far this month`
            : ""
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--color-border)" vertical={false} />
          <XAxis dataKey="short" tick={AXIS_TICK} axisLine={false} tickLine={false} />
          <YAxis
            allowDecimals={false}
            tick={AXIS_TICK}
            axisLine={false}
            tickLine={false}
            width={money ? 64 : 36}
            tickFormatter={(v: number) => (money ? compactNaira(v) : String(v))}
          />
          <Tooltip
            cursor={{ fill: "var(--color-primary-soft)" }}
            contentStyle={TOOLTIP_STYLE}
            labelFormatter={tooltipLabel}
            formatter={(v) => [format(Number(v)), name]}
          />
          <Bar dataKey={dataKey} name={name} fill="var(--color-primary)" radius={[4, 4, 0, 0]}>
            {data.map((p) => (
              <Cell key={p.month} fillOpacity={p.complete ? 1 : PARTIAL_OPACITY} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export function SubscribersChart({ series }: { series: MonthlyPoint[] }) {
  const data = withShortLabel(series);
  const latest = series.at(-1);

  return (
    <ChartFrame
      title="Subscribers by plan"
      summary={latest ? `${latest.subscribers.toLocaleString("en-NG")} now` : ""}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--color-border)" vertical={false} />
          <XAxis dataKey="short" tick={AXIS_TICK} axisLine={false} tickLine={false} />
          <YAxis allowDecimals={false} tick={AXIS_TICK} axisLine={false} tickLine={false} width={36} />
          <Tooltip
            cursor={{ fill: "var(--color-primary-soft)" }}
            contentStyle={TOOLTIP_STYLE}
            labelFormatter={tooltipLabel}
          />
          <Legend
            iconType="square"
            iconSize={10}
            wrapperStyle={{ fontSize: 12, color: "var(--color-muted)" }}
          />
          {/* A 2px card-coloured stroke keeps the stacked segments apart. */}
          <Bar
            dataKey="standard"
            name="Standard"
            stackId="tier"
            fill="var(--color-primary)"
            stroke="var(--color-card)"
            strokeWidth={2}
          />
          <Bar
            dataKey="premium"
            name="Premium"
            stackId="tier"
            fill="var(--color-chart-2)"
            stroke="var(--color-card)"
            strokeWidth={2}
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

/** ₦12k, ₦1.5M — full naira figures do not fit a y-axis gutter. */
function compactNaira(kobo: number): string {
  const naira = kobo / 100;
  if (naira >= 1_000_000) return `₦${+(naira / 1_000_000).toFixed(1)}M`;
  if (naira >= 1_000) return `₦${+(naira / 1_000).toFixed(1)}k`;
  return `₦${Math.round(naira)}`;
}
