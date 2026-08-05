"use client";

import Link from "next/link";
import {
  LuArrowRight,
  LuCircleCheck,
  LuSparkles,
  LuTriangleAlert,
} from "react-icons/lu";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import type { FlashcardRecommendation } from "@/types/flashcards";

const PRIORITY_STYLE = {
  high: {
    ring: "border-primary/30 bg-primary-soft/30",
    icon: LuTriangleAlert,
    iconClass: "bg-primary text-primary",
  },
  medium: {
    ring: "border-tone-amber-line bg-tone-amber-soft/60",
    icon: LuSparkles,
    iconClass: "bg-tone-amber-soft text-tone-amber-ink",
  },
  low: {
    ring: "border-border bg-card",
    icon: LuCircleCheck,
    iconClass: "bg-secondary text-muted",
  },
} as const;

export function Recommendations({
  recommendations,
}: {
  recommendations: FlashcardRecommendation[];
}) {
  if (recommendations.length === 0) {
    return (
      <EmptyState
        icon={<LuSparkles className="h-6 w-6" />}
        title="No suggestions yet"
        description="Study a deck or finish a lesson, then check back for tailored recommendations."
      />
    );
  }

  return (
    <div className="space-y-3">
      {recommendations.map((rec) => {
        const style = PRIORITY_STYLE[rec.priority];
        const Icon = style.icon;
        const inner = (
          <>
            <span
              className={cn(
                "flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl",
                style.iconClass,
              )}
            >
              <Icon className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-foreground">{rec.title}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted">
                {rec.rationale}
              </p>
            </div>
            <LuArrowRight className="h-4 w-4 flex-shrink-0 text-muted" />
          </>
        );
        const className = cn(
          "group flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition-all hover:shadow-card",
          style.ring,
        );
        return rec.href ? (
          <Link key={rec.id} href={rec.href} className={className}>
            {inner}
          </Link>
        ) : (
          <div key={rec.id} className={className}>
            {inner}
          </div>
        );
      })}
    </div>
  );
}
