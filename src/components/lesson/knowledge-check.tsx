"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { LuCheck, LuCircleHelp, LuRotateCcw, LuX } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import type { CheckBlock } from "@/lib/lesson-engine";
import { InlineMarkdown, Markdown } from "./markdown";

type KnowledgeCheckProps = {
  block: CheckBlock;
  onResult: (attempts: number, correct: boolean) => void;
};

export function KnowledgeCheck({ block, onResult }: KnowledgeCheckProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [wrongAnswer, setWrongAnswer] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [settled, setSettled] = useState(false);

  function choose(option: string) {
    if (settled) return;
    setSelected(option);
    setWrongAnswer(null);
    const nextAttempts = attempts + 1;
    setAttempts(nextAttempts);

    if (option === block.answer) {
      setSettled(true);
      onResult(nextAttempts, true);
    } else {
      setWrongAnswer(option);
    }
  }

  function retry() {
    setSelected(null);
    setWrongAnswer(null);
  }

  const isCorrect = settled && selected === block.answer;

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border bg-secondary/60 px-4 py-3">
        <LuCircleHelp className="h-4 w-4 flex-shrink-0 text-primary" />
        <p className="text-xs font-bold uppercase tracking-wide text-foreground">
          Knowledge check
        </p>
        {settled && (
          <span className="ml-auto rounded-full bg-success-soft px-2.5 py-0.5 text-[11px] font-bold text-success">
            Got it{attempts > 1 ? ` in ${attempts}` : ""}
          </span>
        )}
        {wrongAnswer && (
          <span className="ml-auto rounded-full bg-danger-soft px-2.5 py-0.5 text-[11px] font-bold text-danger">
            Not quite
          </span>
        )}
      </div>

      <div className="p-4">
        <p className="text-sm font-medium leading-relaxed text-foreground">
          <InlineMarkdown content={block.question} />
        </p>

        <div className="mt-4 space-y-2.5" role="group" aria-label="Answer options">
          {Object.entries(block.options).map(([key, value]) => {
            const isChosen = selected === key;
            const isAnswer = key === block.answer;
            const showWrong = wrongAnswer === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => choose(key)}
                disabled={settled}
                aria-pressed={isChosen}
                className={cn(
                  "group flex w-full items-center gap-3 rounded-xl border p-3 text-left text-sm transition-all",
                  settled && isAnswer
                    ? "border-success bg-success-soft ring-2 ring-success/20"
                    : showWrong
                      ? "border-danger bg-danger-soft ring-2 ring-danger/15"
                      : "border-border bg-card hover:border-primary/40",
                  settled && !isAnswer && "opacity-60",
                )}
              >
                <span
                  className={cn(
                    "flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors",
                    settled && isAnswer
                      ? "bg-success text-white"
                      : showWrong
                        ? "bg-danger text-white"
                        : "bg-secondary text-foreground group-hover:bg-primary/10",
                  )}
                >
                  {key}
                </span>
                <span className="flex-1 leading-relaxed text-foreground/90">
                  {/* Inline-only: this sits inside a <button>, whose content
                      model is phrasing. */}
                  <InlineMarkdown content={value} />
                </span>
                {settled && isAnswer && (
                  <LuCheck className="h-5 w-5 flex-shrink-0 text-success" />
                )}
                {showWrong && (
                  <LuX className="h-5 w-5 flex-shrink-0 text-danger" />
                )}
              </button>
            );
          })}
        </div>

        {(isCorrect || wrongAnswer) && block.explanation && (
          <div
            className={cn(
              "mt-4 rounded-xl px-3.5 py-3 text-sm leading-relaxed animate-fade-in",
              isCorrect ? "bg-success-soft/60" : "bg-danger-soft/50",
            )}
          >
            <p className="mb-1 text-xs font-bold uppercase tracking-wide text-foreground/70">
              {isCorrect ? "Explanation" : "Quick recap"}
            </p>
            <div className="text-foreground/90">
              <Markdown content={block.explanation} />
            </div>
          </div>
        )}

        {wrongAnswer && (
          <Button variant="outline" size="sm" className="mt-3" onClick={retry}>
            <LuRotateCcw className="h-4 w-4" />
            Try again
          </Button>
        )}
      </div>
    </div>
  );
}
