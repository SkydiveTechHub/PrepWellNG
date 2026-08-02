"use client";

import { useState } from "react";
import Link from "next/link";
import {
  LuArrowRight,
  LuBookOpen,
  LuLayers,
  LuSparkles,
  LuStar,
} from "react-icons/lu";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { DeckSummary } from "@/types/flashcards";

type DeckListProps = {
  decks: DeckSummary[];
};

export function DeckList({ decks }: DeckListProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 md:gap-4">
      {decks.map((deck) => (
        <DeckCard key={deck.id} deck={deck} />
      ))}
    </div>
  );
}

function DeckCard({ deck }: { deck: DeckSummary }) {
  const [enrolled, setEnrolled] = useState(deck.enrolled);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    try {
      const res = await fetch(`/api/flashcards/decks/${deck.id}/enroll`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enrolled: !enrolled }),
      });
      if (res.ok) setEnrolled((prev) => !prev);
    } finally {
      setBusy(false);
    }
  }

  const progress =
    deck.totalCards > 0
      ? Math.round((deck.reviewed / deck.totalCards) * 100)
      : 0;

  return (
    <div className="card card-interactive group flex flex-col p-4 md:p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
            {deck.source === "LESSON" ? (
              <LuSparkles className="h-4 w-4" />
            ) : (
              <LuBookOpen className="h-4 w-4" />
            )}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-foreground">
              {deck.title}
            </p>
            {deck.subjectName && (
              <p className="truncate text-xs text-muted">
                {deck.subjectName}
                {deck.topicTitle ? ` · ${deck.topicTitle}` : ""}
              </p>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={toggle}
          disabled={busy}
          aria-pressed={enrolled}
          aria-label={enrolled ? "Stop following this deck" : "Follow this deck"}
          className={cn(
            "flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border transition-all",
            enrolled
              ? "border-amber-200 bg-amber-50 text-amber-600"
              : "border-border bg-secondary text-muted hover:border-primary/40 hover:text-primary",
          )}
        >
          <LuStar className={cn("h-4 w-4", enrolled && "fill-current")} />
        </button>
      </div>

      {deck.description && (
        <p className="mt-2.5 line-clamp-2 text-xs leading-relaxed text-muted">
          {deck.description}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <Badge variant="neutral">
          <LuLayers className="h-3 w-3" />
          {deck.totalCards} cards
        </Badge>
        {deck.due > 0 && <Badge variant="amber">{deck.due} due now</Badge>}
        {deck.fresh > 0 && <Badge variant="blue">{deck.fresh} new</Badge>}
      </div>

      <div className="mt-auto pt-4">
        {deck.totalCards > 0 ? (
          <>
            <Progress value={progress} className="h-1.5" tone="auto" />
            <p className="mt-1.5 text-[11px] font-medium text-muted">
              {deck.reviewed} of {deck.totalCards} reviewed
            </p>
          </>
        ) : (
          <p className="text-[11px] font-medium text-muted">No cards yet</p>
        )}
      </div>

      <Link
        href={`/flashcards/${deck.id}`}
        className="mt-3 inline-flex items-center justify-center gap-1.5 rounded-xl border border-border bg-secondary px-3 py-2 text-xs font-semibold text-foreground transition-all group-hover:border-primary/40 hover:bg-primary-soft"
      >
        Study deck
        <LuArrowRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}
