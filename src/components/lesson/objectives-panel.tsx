"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { LuCheck, LuTarget } from "react-icons/lu";

export function ObjectivesPanel({ objectives }: { objectives: string[] }) {
  const [checked, setChecked] = useState<boolean[]>(() =>
    objectives.map(() => false),
  );
  const allRead = checked.length > 0 && checked.every(Boolean);

  function toggle(index: number) {
    setChecked((prev) => prev.map((value, i) => (i === index ? !value : value)));
  }

  return (
    <div className="rounded-2xl border border-border bg-secondary/40 p-5">
      <h3 className="mb-1 flex items-center gap-2 text-sm font-bold text-foreground">
        <LuTarget className="h-4 w-4 text-primary" />
        Learning Objectives
      </h3>
      <p className="mb-3 text-xs text-muted">
        What you&apos;ll be able to do by the end. Tick them off as you read.
      </p>
      <ul className="space-y-2">
        {objectives.map((objective, i) => {
          const isChecked = checked[i];
          return (
            <li key={i}>
              <button
                type="button"
                onClick={() => toggle(i)}
                aria-pressed={isChecked}
                className={cn(
                  "flex w-full items-start gap-2.5 rounded-xl border px-3 py-2 text-left text-sm transition-all",
                  isChecked
                    ? "border-success/30 bg-success-soft/60 text-foreground"
                    : "border-border bg-card hover:border-primary/40",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border text-white transition-colors",
                    isChecked
                      ? "border-success bg-success"
                      : "border-border bg-secondary",
                  )}
                >
                  {isChecked && <LuCheck className="h-3.5 w-3.5" />}
                </span>
                <span className="leading-relaxed text-foreground/90">
                  {objective}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {allRead && (
        <p className="mt-3 text-xs font-semibold text-success">
          All objectives read — you&apos;re ready to start.
        </p>
      )}
    </div>
  );
}
