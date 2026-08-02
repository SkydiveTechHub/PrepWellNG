"use client";

import {
  LuCircleAlert,
  LuFrown,
  LuMeh,
  LuSmile,
} from "react-icons/lu";
import { cn } from "@/lib/utils";
import { RATINGS, RATING_LABEL } from "@/lib/spaced-repetition";
import type { ReviewRating } from "@/lib/spaced-repetition";

type RateBarProps = {
  onRate: (rating: ReviewRating) => void;
  disabled?: boolean;
};

const RATING_ICON = {
  AGAIN: LuCircleAlert,
  HARD: LuFrown,
  GOOD: LuMeh,
  EASY: LuSmile,
} as const;

const RATING_STYLE: Record<ReviewRating, string> = {
  AGAIN: "hover:border-red-300 hover:bg-red-50 text-red-600",
  HARD: "hover:border-orange-300 hover:bg-orange-50 text-orange-600",
  GOOD: "hover:border-blue-300 hover:bg-blue-50 text-blue-600",
  EASY: "hover:border-green-300 hover:bg-green-50 text-green-600",
};

const RATING_KEY: Record<ReviewRating, string> = {
  AGAIN: "1",
  HARD: "2",
  GOOD: "3",
  EASY: "4",
};

export function RateBar({ onRate, disabled }: RateBarProps) {
  return (
    <div className="grid grid-cols-4 gap-2 md:gap-3">
      {RATINGS.map((rating) => {
        const Icon = RATING_ICON[rating];
        return (
          <button
            key={rating}
            type="button"
            disabled={disabled}
            onClick={() => onRate(rating)}
            className={cn(
              "group flex flex-col items-center gap-1 rounded-xl border border-border bg-card px-2 py-3 text-xs font-semibold text-foreground shadow-soft transition-all hover:-translate-y-0.5 disabled:opacity-50 disabled:pointer-events-none",
              RATING_STYLE[rating],
            )}
          >
            <Icon className="h-5 w-5" />
            <span>{RATING_LABEL[rating]}</span>
            <span className="hidden text-[10px] font-medium text-muted sm:block">
              press {RATING_KEY[rating]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
