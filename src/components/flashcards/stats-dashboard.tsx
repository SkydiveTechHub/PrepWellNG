"use client";

import {
  LuActivity,
  LuClock,
  LuFlame,
  LuLayers,
  LuTarget,
  LuTrendingUp,
} from "react-icons/lu";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { FlashcardStats } from "@/types/flashcards";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type StatsDashboardProps = {
  stats: FlashcardStats;
};

function pct(value: number | null): string {
  return value !== null ? `${Math.round(value * 100)}%` : "—";
}

export function StatsDashboard({ stats }: StatsDashboardProps) {
  const tiles = [
    {
      label: "Reviews this week",
      value: stats.reviewsThisWeek.toString(),
      icon: LuActivity,
      tile: "bg-primary-soft text-primary",
    },
    {
      label: "Cards learned",
      value: stats.cardsLearned.toString(),
      icon: LuLayers,
      tile: "bg-success-soft text-success",
    },
    {
      label: "Retention",
      value: pct(stats.measuredRetention),
      sub: `Predicted ${pct(stats.predictedRetention)}`,
      icon: LuTarget,
      tile: "bg-purple-100 text-purple-700",
    },
    {
      label: "Day streak",
      value: `${stats.streak}d`,
      icon: LuFlame,
      tile: "bg-orange-100 text-orange-600",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        {tiles.map((tile) => (
          <div key={tile.label} className="card card-interactive p-4 md:p-5">
            <div
              className={cn(
                "mb-3 flex h-10 w-10 items-center justify-center rounded-xl",
                tile.tile,
              )}
            >
              <tile.icon className="h-5 w-5" />
            </div>
            <p className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">
              {tile.value}
            </p>
            <p className="mt-0.5 text-xs font-medium text-muted">{tile.label}</p>
            {tile.sub && (
              <p className="mt-0.5 text-[11px] font-medium text-muted/70">
                {tile.sub}
              </p>
            )}
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-4 md:p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-bold text-foreground">Reviews per day</h3>
            <LuTrendingUp className="h-4 w-4 text-muted" />
          </div>
          <ActivityChart activity={stats.activity} />
        </div>
        <div className="card p-4 md:p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-bold text-foreground">Due & new cards</h3>
            <LuClock className="h-4 w-4 text-muted" />
          </div>
          <div className="space-y-4">
            <StatRow
              label="Cards due now"
              value={stats.totalDue}
              max={Math.max(1, stats.totalDue + stats.totalNew)}
            />
            <StatRow
              label="New cards ready"
              value={stats.totalNew}
              max={Math.max(1, stats.totalDue + stats.totalNew)}
            />
            <div className="grid grid-cols-3 gap-2 pt-1">
              <MixStat label="Easy" value={stats.difficultyMix.easy} tone="success" />
              <MixStat label="Medium" value={stats.difficultyMix.medium} tone="warning" />
              <MixStat label="Hard" value={stats.difficultyMix.hard} tone="danger" />
            </div>
          </div>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-4 py-3 md:px-5">
          <h3 className="text-sm font-bold text-foreground">Deck breakdown</h3>
          <span className="text-xs font-medium text-muted">
            Retention = predicted recall
          </span>
        </div>
        {stats.decks.length > 0 ? (
          <div className="divide-y divide-border">
            {stats.decks.map((deck) => (
              <div
                key={deck.deckId}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 md:px-5"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {deck.title}
                  </p>
                  <p className="text-xs text-muted">
                    {deck.reviewed}/{deck.total} reviewed · {deck.due} due ·{" "}
                    {deck.fresh} new
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {deck.retention !== null && (
                    <span
                      className={cn(
                        "text-sm font-bold",
                        deck.retention >= 0.75
                          ? "text-success"
                          : deck.retention >= 0.5
                            ? "text-warning"
                            : "text-danger",
                      )}
                    >
                      {Math.round(deck.retention * 100)}%
                    </span>
                  )}
                  <Progress
                    value={deck.total > 0 ? (deck.reviewed / deck.total) * 100 : 0}
                    className="w-20"
                    tone="auto"
                  />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="px-5 py-8 text-center text-sm text-muted">
            No decks yet — start studying to build your breakdown.
          </p>
        )}
      </div>

      {stats.leechCards.length > 0 && (
        <div className="card p-4 md:p-5">
          <h3 className="mb-3 text-sm font-bold text-foreground">
            Cards that need extra attention
          </h3>
          <div className="space-y-2">
            {stats.leechCards.map((card) => (
              <div
                key={card.cardId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-danger/20 bg-danger-soft/30 px-3.5 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {card.prompt}
                  </p>
                  <p className="text-xs text-muted">
                    {card.deckTitle} · {card.lapses} lapses ·{" "}
                    {card.successRate}% success over {card.reviews} reviews
                  </p>
                </div>
                <Badge variant="red">Relearn</Badge>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatRow({
  label,
  value,
  max,
}: {
  label: string;
  value: number;
  max: number;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="font-medium text-foreground">{label}</span>
        <span className="font-bold text-foreground">{value}</span>
      </div>
      <Progress value={(value / max) * 100} className="h-1.5" tone="primary" />
    </div>
  );
}

function MixStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "success" | "warning" | "danger";
}) {
  const toneClass = {
    success: "bg-success-soft text-success",
    warning: "bg-warning-soft text-warning",
    danger: "bg-danger-soft text-danger",
  }[tone];
  return (
    <div className={cn("rounded-xl px-3 py-2.5 text-center", toneClass)}>
      <p className="text-lg font-bold">{value}</p>
      <p className="text-[11px] font-semibold">{label}</p>
    </div>
  );
}

function ActivityChart({ activity }: { activity: FlashcardStats["activity"] }) {
  const data = activity.map((point) => ({
    ...point,
    short: point.date.slice(5),
  }));

  return (
    <div className="h-48 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
          <XAxis
            dataKey="short"
            tick={{ fontSize: 10, fill: "var(--color-muted)" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fontSize: 10, fill: "var(--color-muted)" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: "var(--color-primary-soft)" }}
            contentStyle={{
              borderRadius: 12,
              border: "1px solid var(--color-border)",
              background: "var(--color-card)",
              fontSize: 12,
            }}
          />
          <Bar dataKey="reviews" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
