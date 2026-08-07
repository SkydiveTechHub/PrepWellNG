"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { LuChevronDown, LuEye, LuLightbulb } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import type { ExampleBlock } from "@/lib/lesson-engine";
import { InlineMarkdown, Markdown } from "./markdown";

export function WorkedExample({ block }: { block: ExampleBlock }) {
  const isGuided = block.mode !== "worked";
  const [visibleSteps, setVisibleSteps] = useState(isGuided ? 0 : 0);
  const [showAnswer, setShowAnswer] = useState(false);

  const allStepsShown = visibleSteps >= block.steps.length;
  const answerRevealed = isGuided ? showAnswer : allStepsShown;

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border bg-primary-soft px-4 py-3">
        <LuLightbulb className="h-4 w-4 flex-shrink-0 text-primary" />
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wide text-primary-soft-foreground">
            Worked example
          </p>
          <p className="truncate text-sm font-semibold text-foreground">
            {block.title ?? "Worked example"}
          </p>
        </div>
      </div>

      <div className="p-4">
        <Markdown content={block.problem} />

        {block.steps.length > 0 && (
          <div className="mt-4 space-y-2">
            {block.steps.slice(0, visibleSteps).map((step, i) => (
              <div
                key={i}
                className="flex items-start gap-2.5 rounded-xl border border-border bg-secondary/40 px-3 py-2.5 animate-slide-up"
              >
                <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <Markdown content={step} />
                </div>
              </div>
            ))}
          </div>
        )}

        {answerRevealed && (
          <div className="mt-3 rounded-xl bg-success-soft/70 px-3 py-2.5 animate-slide-up">
            <p className="text-sm leading-relaxed text-foreground">
              <span className="font-semibold text-success">Answer: </span>
              <InlineMarkdown content={block.answer} />
            </p>
          </div>
        )}

        {!allStepsShown && !isGuided && (
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => setVisibleSteps((s) => s + 1)}
          >
            Show next step
            <LuChevronDown className="h-4 w-4" />
          </Button>
        )}

        {isGuided && !answerRevealed && (
          <Button
            variant="outline"
            size="sm"
            className={cn("mt-4")}
            onClick={() => {
              setShowAnswer(true);
              setVisibleSteps(block.steps.length);
            }}
          >
            <LuEye className="h-4 w-4" />
            Reveal answer
          </Button>
        )}

        {isGuided && answerRevealed && block.steps.length > 0 && (
          <p className="mt-3 text-xs text-muted">
            {block.steps.length} step{block.steps.length === 1 ? "" : "s"} shown
            above — now try one yourself.
          </p>
        )}
      </div>
    </div>
  );
}
