"use client";

import { useState } from "react";
import {
  LuBookOpen,
  LuCheck,
  LuChevronDown,
  LuCircleAlert,
  LuLightbulb,
  LuSparkles,
  LuX,
} from "react-icons/lu";
import { Badge } from "@/components/ui/badge";
import { InteractiveDiagram } from "./interactive-diagram";
import { WorkedExample } from "./worked-example";
import { KnowledgeCheck } from "./knowledge-check";
import type { LessonBlock } from "@/lib/lesson-engine";

type MicroCardProps = {
  block: LessonBlock;
  onCheckResult?: (blockId: string, attempts: number, correct: boolean) => void;
};

export function MicroCard({ block, onCheckResult }: MicroCardProps) {
  switch (block.type) {
    case "concept":
      return <ConceptCard block={block} />;
    case "diagram":
      return <InteractiveDiagram block={block} />;
    case "example":
      return <WorkedExample block={block} />;
    case "tip":
      return <TipCard block={block} />;
    case "mistake":
      return <MistakeCard block={block} />;
    case "mnemonic":
      return <MnemonicCard block={block} />;
    case "check":
      return (
        <KnowledgeCheck
          block={block}
          onResult={(attempts, correct) =>
            onCheckResult?.(block.id, attempts, correct)
          }
        />
      );
  }
}

function ConceptCard({ block }: { block: Extract<LessonBlock, { type: "concept" }> }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border bg-primary-soft px-4 py-3">
        <LuBookOpen className="h-4 w-4 flex-shrink-0 text-primary" />
        <p className="text-sm font-semibold text-foreground">
          {block.title ?? "Concept"}
        </p>
      </div>
      <div className="p-4">
        <p className="text-sm leading-relaxed text-foreground">{block.text}</p>
        {block.reveal && (
          <div className="mt-3">
            {revealed ? (
              <div className="rounded-xl bg-primary-soft/60 px-3.5 py-3 text-sm leading-relaxed text-foreground animate-fade-in">
                {block.reveal}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setRevealed(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-secondary px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:border-primary/40"
              >
                Reveal the rule
                <LuChevronDown className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function TipCard({ block }: { block: Extract<LessonBlock, { type: "tip" }> }) {
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
      <div className="mb-1.5 flex items-center gap-2">
        <LuSparkles className="h-4 w-4 flex-shrink-0 text-warning" />
        <p className="text-xs font-bold uppercase tracking-wide text-warning">
          Exam tip
        </p>
        {block.examType && <Badge variant="amber">{block.examType}</Badge>}
      </div>
      <p className="text-sm leading-relaxed text-foreground">{block.text}</p>
    </div>
  );
}

function MistakeCard({ block }: { block: Extract<LessonBlock, { type: "mistake" }> }) {
  const [flipped, setFlipped] = useState(false);
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <LuCircleAlert className="h-4 w-4 flex-shrink-0 text-danger" />
        <p className="text-xs font-bold uppercase tracking-wide text-foreground/70">
          Common mistake
        </p>
      </div>
      {!flipped ? (
        <button
          type="button"
          onClick={() => setFlipped(true)}
          className="flex w-full items-start gap-3 rounded-xl border border-danger/30 bg-danger-soft/40 px-3.5 py-3 text-left text-sm transition-all hover:border-danger/50"
        >
          <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-danger text-white">
            <LuX className="h-3 w-3" />
          </span>
          <span className="leading-relaxed text-foreground/90">{block.wrong}</span>
          <LuChevronDown className="ml-auto h-4 w-4 flex-shrink-0 text-danger/60" />
        </button>
      ) : (
        <div className="animate-fade-in space-y-2">
          <div className="flex items-start gap-3 rounded-xl border border-danger/30 bg-danger-soft/40 px-3.5 py-3">
            <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-danger text-white">
              <LuX className="h-3 w-3" />
            </span>
            <p className="text-sm leading-relaxed text-foreground/90">{block.wrong}</p>
          </div>
          <div className="flex items-start gap-3 rounded-xl border border-success/30 bg-success-soft/50 px-3.5 py-3">
            <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-success text-white">
              <LuCheck className="h-3 w-3" />
            </span>
            <p className="text-sm leading-relaxed text-foreground/90">{block.right}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function MnemonicCard({ block }: { block: Extract<LessonBlock, { type: "mnemonic" }> }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <div className="rounded-2xl border border-purple-200 bg-purple-50/60 p-4">
      <div className="mb-2 flex items-center gap-2">
        <LuLightbulb className="h-4 w-4 flex-shrink-0 text-purple-600" />
        <p className="text-xs font-bold uppercase tracking-wide text-purple-700">
          Mnemonic
        </p>
      </div>
      <p className="text-base font-semibold leading-relaxed text-foreground">
        {block.phrase}
      </p>
      {!revealed ? (
        <button
          type="button"
          onClick={() => setRevealed(true)}
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-purple-200 bg-card px-3 py-1.5 text-xs font-semibold text-purple-700 transition-colors hover:border-purple-400"
        >
          Reveal the list
          <LuChevronDown className="h-3.5 w-3.5" />
        </button>
      ) : (
        <ul className="mt-3 space-y-1.5 animate-fade-in">
          {block.encoded.map((item, i) => (
            <li key={i} className="flex items-start gap-2 text-sm leading-relaxed text-foreground/90">
              <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-purple-400" />
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

