"use client";

import { useState } from "react";
import {
  LuCheck,
  LuChevronDown,
} from "react-icons/lu";
import { Badge } from "@/components/ui/badge";
import { Markdown } from "@/components/lesson/markdown";
import { renderLatex as renderLatexShared } from "@/lib/latex";
import { CARD_TYPE_BADGE, CARD_TYPE_LABEL } from "@/lib/flashcard-content";
import type { StudyCardState } from "@/types/flashcards";
import { cn } from "@/lib/utils";

type FlashcardViewProps = {
  card: StudyCardState;
  /** Whether the back of the card is showing. */
  revealed: boolean;
  onReveal: () => void;
  /** Objective result for FILL_IN_BLANK / TRUE_FALSE cards (null until graded). */
  objective: { correct: boolean } | null;
  onObjective: (correct: boolean) => void;
};

// Formula cards render in display mode. The implementation moved to
// src/lib/latex.ts so lesson prose and flashcards share one KaTeX
// configuration -- and one place where the `trust: false` argument is made.
const renderLatex = (latex: string) => renderLatexShared(latex, true);

export function FlashcardView({
  card,
  revealed,
  onReveal,
  objective,
  onObjective,
}: FlashcardViewProps) {
  const payload = card.payload as Record<string, unknown>;
  const isObjective =
    card.cardType === "FILL_IN_BLANK" || card.cardType === "TRUE_FALSE";
  const showBack = revealed;

  return (
    <div className="card mx-auto w-full max-w-2xl overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-secondary/50 px-4 py-3 md:px-6">
        <div className="flex items-center gap-2">
          <Badge variant={CARD_TYPE_BADGE[card.cardType] as "blue"}>
            {CARD_TYPE_LABEL[card.cardType]}
          </Badge>
          {card.prompt && (
            <p className="truncate text-sm font-semibold text-muted">
              {card.prompt}
            </p>
          )}
        </div>
        <span className="text-xs font-medium text-muted">
          {card.authoredDifficulty.toLowerCase()}
        </span>
      </div>

      <div className="p-5 md:p-8">
        <FrontSide
          card={card}
          payload={payload}
          objective={objective}
          onObjective={onObjective}
          revealed={revealed}
          onReveal={onReveal}
        />

        {showBack && !isObjective && (
          <div className="mt-6 animate-fade-in border-t border-border pt-6">
            <p className="section-label mb-3">Answer</p>
            <BackSide card={card} payload={payload} />
          </div>
        )}

        {showBack && isObjective && (
          <div className="mt-4 animate-fade-in">
            {objective?.correct ? (
              <div className="rounded-xl border border-success/30 bg-success-soft/50 px-4 py-3 text-sm font-semibold text-success">
                Correct — well done.
              </div>
            ) : (
              <div className="rounded-xl border border-danger/30 bg-danger-soft/40 px-4 py-3 text-sm font-semibold text-danger">
                Not quite — see the answer below.
              </div>
            )}
            <div className="mt-4 border-t border-border pt-4">
              <p className="section-label mb-3">Answer</p>
              <BackSide card={card} payload={payload} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function FrontSide({
  card,
  payload,
  objective,
  onObjective,
  revealed,
  onReveal,
}: {
  card: StudyCardState;
  payload: Record<string, unknown>;
  objective: { correct: boolean } | null;
  onObjective: (correct: boolean) => void;
  revealed: boolean;
  onReveal: () => void;
}) {
  switch (card.cardType) {
    case "DEFINITION":
      return <DefinitionFront payload={payload} />;
    case "FORMULA":
      return <FormulaFront payload={payload} />;
    case "IMAGE":
      return <ImageFront payload={payload} />;
    case "DIAGRAM":
      return <DiagramFront payload={payload} />;
    case "COMPARE_CONTRAST":
      return <CompareFront payload={payload} />;
    case "SCENARIO":
      return <ScenarioFront payload={payload} />;
    case "PROCESS":
      return <ProcessFront payload={payload} />;
    case "FILL_IN_BLANK":
      return (
        <FillBlankFront
          payload={payload}
          objective={objective}
          onObjective={onObjective}
          revealed={revealed}
          onReveal={onReveal}
        />
      );
    case "TRUE_FALSE":
      return (
        <TrueFalseFront
          payload={payload}
          objective={objective}
          onObjective={onObjective}
        />
      );
  }
}

function BackSide({
  card,
  payload,
}: {
  card: StudyCardState;
  payload: Record<string, unknown>;
}) {
  switch (card.cardType) {
    case "DEFINITION":
      return <DefinitionBack payload={payload} />;
    case "FORMULA":
      return <FormulaBack payload={payload} />;
    case "IMAGE":
      return <ImageBack payload={payload} />;
    case "DIAGRAM":
      return <DiagramBack payload={payload} />;
    case "COMPARE_CONTRAST":
      return <CompareBack payload={payload} />;
    case "SCENARIO":
      return <ScenarioBack payload={payload} />;
    case "PROCESS":
      return <ProcessBack payload={payload} />;
    case "FILL_IN_BLANK":
      return <FillBlankBack payload={payload} />;
    case "TRUE_FALSE":
      return <TrueFalseBack payload={payload} />;
  }
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function strList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function DefinitionFront({ payload }: { payload: Record<string, unknown> }) {
  const term = str(payload.term);
  return (
    <div>
      {term && (
        <h2 className="text-xl font-bold tracking-tight text-foreground md:text-2xl">
          {term}
        </h2>
      )}
      <p className="mt-3 text-sm text-muted">Define it, then check your answer.</p>
    </div>
  );
}

function DefinitionBack({ payload }: { payload: Record<string, unknown> }) {
  return (
    <div className="space-y-3">
      {/* Card bodies are lesson prose, so they carry the same markdown the
          lesson does -- **bold**, bullets, and the tables that SI-unit and
          prefix sections are built from. Rendered as a plain string they
          reached the student as literal `**` and `|---|` pipe soup. Markdown
          escapes by construction; no dangerouslySetInnerHTML is involved. */}
      <Markdown content={str(payload.definition)} />
      {str(payload.example) && (
        <div className="rounded-xl bg-primary-soft/60 px-3.5 py-2.5 text-sm leading-relaxed text-foreground">
          <span className="font-semibold">Example: </span>
          {str(payload.example)}
        </div>
      )}
    </div>
  );
}

function FormulaFront({ payload }: { payload: Record<string, unknown> }) {
  const latex = str(payload.latex);
  return (
    <div className="text-center">
      <p className="mb-4 text-sm font-semibold text-muted">What is this formula?</p>
      <div
        className="overflow-x-auto text-foreground"
        dangerouslySetInnerHTML={{ __html: renderLatex(latex) }}
      />
    </div>
  );
}

function FormulaBack({ payload }: { payload: Record<string, unknown> }) {
  const variables = Array.isArray(payload.variables)
    ? (payload.variables as { symbol: string; meaning: string }[])
    : [];
  return (
    <div className="space-y-3">
      <p className="text-lg font-bold text-foreground">{str(payload.name)}</p>
      {variables.length > 0 && (
        <ul className="space-y-1.5">
          {variables.map((v, i) => (
            <li key={i} className="flex items-baseline gap-2 text-sm text-foreground">
              <span className="font-mono font-semibold text-primary">{v.symbol}</span>
              <span className="text-muted">=</span>
              <span>{v.meaning}</span>
            </li>
          ))}
        </ul>
      )}
      {str(payload.note) && (
        <p className="text-sm leading-relaxed text-muted">{str(payload.note)}</p>
      )}
    </div>
  );
}

function ImageFront({ payload }: { payload: Record<string, unknown> }) {
  return (
    <div className="text-center">
      {str(payload.imageUrl) && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={str(payload.imageUrl)}
          alt={str(payload.prompt) || "Flashcard image"}
          className="mx-auto max-h-64 rounded-xl object-contain"
        />
      )}
      <p className="mt-3 text-sm text-muted">Study the image, then check the answer.</p>
    </div>
  );
}

function ImageBack({ payload }: { payload: Record<string, unknown> }) {
  return (
    <p className="text-base leading-relaxed text-foreground">{str(payload.answer)}</p>
  );
}

function DiagramFront({ payload }: { payload: Record<string, unknown> }) {
  const hotspots = Array.isArray(payload.hotspots)
    ? (payload.hotspots as { id: string; label: string }[])
    : [];
  return (
    <div>
      <div
        className="mx-auto max-w-full overflow-hidden rounded-xl border border-border bg-secondary/40"
        dangerouslySetInnerHTML={{ __html: str(payload.svg) }}
      />
      {hotspots.length > 0 && (
        <p className="mt-3 text-center text-sm text-muted">
          Can you label every part?
        </p>
      )}
    </div>
  );
}

function DiagramBack({ payload }: { payload: Record<string, unknown> }) {
  const hotspots = Array.isArray(payload.hotspots)
    ? (payload.hotspots as { id: string; label: string; text: string }[])
    : [];
  if (hotspots.length === 0) return null;
  return (
    <ul className="space-y-2">
      {hotspots.map((h) => (
        <li key={h.id} className="text-sm leading-relaxed text-foreground">
          <span className="font-semibold text-primary">{h.label}: </span>
          {h.text}
        </li>
      ))}
    </ul>
  );
}

function CompareFront({ payload }: { payload: Record<string, unknown> }) {
  return (
    <div>
      <h2 className="text-xl font-bold tracking-tight text-foreground">
        {str(payload.itemA)}
      </h2>
      <div className="my-2 flex items-center justify-center">
        <span className="text-xs font-bold uppercase tracking-widest text-muted">
          vs
        </span>
      </div>
      <h2 className="text-xl font-bold tracking-tight text-foreground">
        {str(payload.itemB)}
      </h2>
      <p className="mt-3 text-sm text-muted">
        Compare and contrast both, then check the answer.
      </p>
    </div>
  );
}

function CompareBack({ payload }: { payload: Record<string, unknown> }) {
  const onlyA = strList(payload.onlyA);
  const onlyB = strList(payload.onlyB);
  const shared = strList(payload.shared);
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-xl border border-tone-blue-line bg-tone-blue-soft/60 p-3">
        <p className="mb-2 text-xs font-bold text-tone-blue-ink">Only {str(payload.itemA)}</p>
        <ul className="space-y-1">
          {onlyA.map((item, i) => (
            <li key={i} className="text-xs leading-relaxed text-foreground">• {item}</li>
          ))}
        </ul>
      </div>
      <div className="rounded-xl border border-tone-green-line bg-tone-green-soft/60 p-3">
        <p className="mb-2 text-xs font-bold text-tone-green-ink">Both</p>
        <ul className="space-y-1">
          {shared.map((item, i) => (
            <li key={i} className="text-xs leading-relaxed text-foreground">• {item}</li>
          ))}
        </ul>
      </div>
      <div className="rounded-xl border border-tone-purple-line bg-tone-purple-soft/60 p-3">
        <p className="mb-2 text-xs font-bold text-tone-purple-ink">Only {str(payload.itemB)}</p>
        <ul className="space-y-1">
          {onlyB.map((item, i) => (
            <li key={i} className="text-xs leading-relaxed text-foreground">• {item}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function ScenarioFront({ payload }: { payload: Record<string, unknown> }) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-secondary/60 px-4 py-3 text-sm leading-relaxed text-foreground">
        {str(payload.scenario)}
      </div>
      <p className="text-base font-semibold text-foreground">
        {str(payload.question)}
      </p>
    </div>
  );
}

function ScenarioBack({ payload }: { payload: Record<string, unknown> }) {
  return (
    <div className="space-y-3">
      <p className="text-base font-semibold text-foreground">{str(payload.answer)}</p>
      {str(payload.explanation) && (
        <p className="whitespace-pre-line text-sm leading-relaxed text-muted">
          {str(payload.explanation)}
        </p>
      )}
    </div>
  );
}

function ProcessFront({ payload }: { payload: Record<string, unknown> }) {
  return (
    <div>
      <h2 className="text-xl font-bold tracking-tight text-foreground">
        {str(payload.title)}
      </h2>
      <p className="mt-3 text-sm text-muted">
        Recite the steps in order, then check the answer.
      </p>
    </div>
  );
}

function ProcessBack({ payload }: { payload: Record<string, unknown> }) {
  const steps = strList(payload.steps);
  return (
    <ol className="space-y-2">
      {steps.map((step, i) => (
        <li key={i} className="flex items-start gap-3 text-sm leading-relaxed text-foreground">
          <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-bold text-primary">
            {i + 1}
          </span>
          {step}
        </li>
      ))}
    </ol>
  );
}

function FillBlankFront({
  payload,
  objective,
  onObjective,
  revealed,
  onReveal,
}: {
  payload: Record<string, unknown>;
  objective: { correct: boolean } | null;
  onObjective: (correct: boolean) => void;
  revealed: boolean;
  onReveal: () => void;
}) {
  const blanks = Array.isArray(payload.blanks)
    ? (payload.blanks as { id: string; answer: string }[])
    : [];
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const sentence = str(payload.sentence);

  const allFilled = blanks.every((b) => str(answers[b.id]).trim().length > 0);

  function grade() {
    const correct = blanks.every(
      (b) =>
        str(answers[b.id]).trim().toLowerCase() === b.answer.trim().toLowerCase(),
    );
    onObjective(correct);
  }

  return (
    <div>
      <p className="mb-4 text-sm text-muted">Fill in each blank, then check.</p>
      <p className="whitespace-pre-line text-base leading-loose text-foreground">
        {sentence.split("___").reduce<React.ReactNode[]>((nodes, part, i) => {
          nodes.push(part);
          if (i < blanks.length) {
            const blank = blanks[i];
            const value = str(answers[blank.id]);
            nodes.push(
              objective ? (
                <span
                  key={blank.id}
                  className={cn(
                    "mx-1 inline-block rounded-md border px-2 py-0.5 font-semibold",
                    blank.answer.trim().toLowerCase() ===
                      str(answers[blank.id]).trim().toLowerCase()
                      ? "border-success/40 bg-success-soft text-success"
                      : "border-danger/40 bg-danger-soft text-danger",
                  )}
                >
                  {blank.answer}
                </span>
              ) : (
                <input
                  key={blank.id}
                  value={value}
                  onChange={(e) =>
                    setAnswers((prev) => ({ ...prev, [blank.id]: e.target.value }))
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && allFilled && !objective) grade();
                  }}
                  placeholder="…"
                  disabled={Boolean(objective)}
                  aria-label={`Blank ${i + 1}`}
                  className="mx-1 inline-block w-28 rounded-md border border-primary/40 bg-card px-2 py-0.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-70"
                />
              ),
            );
          }
          return nodes;
        }, [])}
      </p>
      {!objective && (
        <button
          type="button"
          onClick={grade}
          disabled={!allFilled}
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-soft transition-all hover:bg-primary-hover disabled:opacity-40"
        >
          <LuCheck className="h-4 w-4" />
          Check answer
        </button>
      )}
      {objective && !revealed && (
        <button
          type="button"
          onClick={onReveal}
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-border bg-secondary px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:border-primary/40"
        >
          Show explanation
          <LuChevronDown className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

function FillBlankBack({ payload }: { payload: Record<string, unknown> }) {
  const explanation = str(payload.explanation);
  const hint = str(payload.hint);
  if (!explanation && !hint) return null;
  return (
    <div className="space-y-2">
      {hint && <p className="text-sm text-muted">{hint}</p>}
      {explanation && (
        <p className="text-sm leading-relaxed text-foreground">{explanation}</p>
      )}
    </div>
  );
}

function TrueFalseFront({
  payload,
  objective,
  onObjective,
}: {
  payload: Record<string, unknown>;
  objective: { correct: boolean } | null;
  onObjective: (correct: boolean) => void;
}) {
  const statement = str(payload.statement);
  const answer = payload.answer === true;
  const chosen = objective ? (answer ? "TRUE" : "FALSE") : undefined;

  return (
    <div>
      <p className="mb-5 text-base font-medium leading-relaxed text-foreground">
        {statement}
      </p>
      <div className="grid grid-cols-2 gap-3">
        {(["TRUE", "FALSE"] as const).map((label) => {
          const isAnswer = label === "TRUE" ? answer : !answer;
          return (
            <button
              key={label}
              type="button"
              disabled={Boolean(objective)}
              onClick={() => onObjective(isAnswer)}
              className={cn(
                "rounded-xl border px-4 py-3 text-sm font-bold transition-all disabled:cursor-default",
                objective
                  ? isAnswer
                    ? "border-success/40 bg-success-soft text-success"
                    : "border-border bg-secondary text-muted"
                  : "border-border bg-card text-foreground hover:border-primary/40 hover:bg-primary-soft/40 active:scale-[0.98]",
              )}
            >
              {label}
            </button>
          );
        })}
      </div>
      {chosen && (
        <p className="mt-3 text-sm font-semibold text-muted">
          Answer: {chosen}
        </p>
      )}
    </div>
  );
}

function TrueFalseBack({ payload }: { payload: Record<string, unknown> }) {
  const explanation = str(payload.explanation);
  if (!explanation) return null;
  return <p className="text-sm leading-relaxed text-foreground">{explanation}</p>;
}
