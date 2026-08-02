"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  LuArrowRight,
  LuPartyPopper,
  LuRotateCcw,
  LuTimer,
} from "react-icons/lu";
import { Button, buttonClass } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { FlashcardView } from "./flashcard-view";
import { RateBar } from "./rate-bar";
import { intervalLabel } from "@/lib/spaced-repetition";
import type { ReviewOutcome, StudyCardState } from "@/types/flashcards";
import type { ReviewRating } from "@/lib/spaced-repetition";

type StudySessionProps = {
  deckId: string;
  deckTitle: string;
  initialQueue: StudyCardState[];
};

type SessionResult = {
  reviewed: number;
  correct: number;
  predictedRetention: number;
};

type CardResult = {
  objective: { correct: boolean } | null;
  outcome: ReviewOutcome | null;
  responseTimeMs: number;
};

export function StudySession({ deckId, initialQueue }: StudySessionProps) {
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [startMs, setStartMs] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const [results, setResults] = useState<Record<string, CardResult>>({});
  const [sessionStats, setSessionStats] = useState<SessionResult>({
    reviewed: 0,
    correct: 0,
    predictedRetention: 1,
  });

  const total = initialQueue.length;
  const card = initialQueue[index];

  // Live per-card timer. Ticks only while a card is on screen.
  useEffect(() => {
    if (done || !card) return;
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [done, card]);

  const advance = useCallback(() => {
    setRevealed(false);
    setStartMs(Date.now());
    setIndex((prev) => {
      const next = prev + 1;
      if (next >= total) setDone(true);
      return Math.min(next, total);
    });
  }, [total]);

  const submit = useCallback(
    async (
      rating: ReviewRating,
      objectiveCorrect: boolean | null,
      responseTimeMs: number,
    ) => {
      if (busy || !card) return;
      setBusy(true);
      try {
        const res = await fetch("/api/flashcards/review", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            flashcardId: card.cardId,
            rating,
            responseTimeMs,
            objectiveCorrect,
          }),
        });
        const data = await res.json();
        const outcome: ReviewOutcome | null = res.ok ? data.outcome : null;
        if (!outcome) throw new Error(data.error ?? "Failed to record review");

        setResults((prev) => ({
          ...prev,
          [card.cardId]: {
            objective:
              objectiveCorrect === null
                ? prev[card.cardId]?.objective ?? null
                : { correct: objectiveCorrect },
            outcome,
            responseTimeMs,
          },
        }));

        setSessionStats((prev) => ({
          ...prev,
          reviewed: prev.reviewed + 1,
          correct:
            prev.correct +
            (objectiveCorrect === null ? 1 : objectiveCorrect ? 1 : 0),
          predictedRetention: outcome.retention,
        }));

        advance();
      } catch (error) {
        console.error(error);
      } finally {
        setBusy(false);
      }
    },
    [busy, card, advance],
  );

  // Keyboard: Space to reveal, 1–4 to rate.
  useEffect(() => {
    if (done || busy) return;
    function onKey(e: KeyboardEvent) {
      if (e.repeat) return;
      if (e.code === "Space") {
        e.preventDefault();
        if (!revealed && !isObjectiveCard(card)) setRevealed(true);
        return;
      }
      const map: Record<string, ReviewRating> = {
        "1": "AGAIN",
        "2": "HARD",
        "3": "GOOD",
        "4": "EASY",
      };
      const rating = map[e.key];
      if (rating && revealed) {
        const elapsed = Date.now() - startMs;
        submit(rating, results[card?.cardId ?? ""]?.objective?.correct ?? null, elapsed);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [done, busy, revealed, card, startMs, results, submit]);

  if (!card) {
    return (
      <div className="card p-8 text-center text-sm text-muted">
        No cards to study in this deck yet.
      </div>
    );
  }

  const result = results[card.cardId];

  if (done) {
    const accuracy =
      sessionStats.reviewed > 0
        ? Math.round((sessionStats.correct / sessionStats.reviewed) * 100)
        : 100;
    return (
      <div className="mx-auto max-w-xl space-y-6">
        <div className="card flex flex-col items-center px-6 py-12 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-success-soft text-success">
            <LuPartyPopper className="h-8 w-8" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">
            Session complete!
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            You reviewed {sessionStats.reviewed} card
            {sessionStats.reviewed === 1 ? "" : "s"} with {accuracy}% success.
            Predicted recall is now{" "}
            {Math.round(sessionStats.predictedRetention * 100)}%.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link href="/flashcards" className={buttonClass("primary", "md")}>
              Back to decks
            </Link>
            <Link
              href={`/flashcards/${deckId}`}
              className={buttonClass("outline", "md")}
            >
              <LuRotateCcw className="h-4 w-4" />
              Study again
            </Link>
          </div>
        </div>
        <p className="text-center text-xs text-muted">
          Well done — see you tomorrow. A little each day keeps the curve flat.
        </p>
      </div>
    );
  }

  const answered = Boolean(result?.outcome);
  const isObjective = isObjectiveCard(card);

  const handleReveal = () => {
    if (isObjective && !result?.objective) return;
    setRevealed(true);
  };

  const handleObjective = (correct: boolean) => {
    setResults((prev) => ({
      ...prev,
      [card.cardId]: {
        ...(prev[card.cardId] ?? { objective: null, outcome: null, responseTimeMs: 0 }),
        objective: { correct },
      },
    }));
    setRevealed(true);
  };

  return (
    <div className="space-y-5">
      <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-4">
        <Badge variant="neutral">
          {index + 1} of {total}
        </Badge>
        <div className="flex items-center gap-1.5 text-xs font-semibold text-muted">
          <LuTimer className="h-3.5 w-3.5" />
          {((Math.max(0, now - startMs)) / 1000).toFixed(1)}s
        </div>
      </div>
      <Progress
        value={((index + (revealed ? 1 : 0)) / Math.max(1, total)) * 100}
        className="mx-auto max-w-2xl"
        tone="primary"
      />

      <FlashcardView
        card={card}
        revealed={revealed}
        onReveal={handleReveal}
        objective={result?.objective ?? null}
        onObjective={handleObjective}
      />

      <div className="mx-auto w-full max-w-2xl space-y-4">
        {!revealed && !isObjective && (
          <Button onClick={handleReveal} className="w-full" size="lg">
            Show answer
            <span className="text-xs font-medium opacity-70">(Space)</span>
          </Button>
        )}
        {revealed && !answered && (
          <>
            <p className="text-center text-xs font-semibold uppercase tracking-widest text-muted">
              How well did you know it?
            </p>
            <RateBar
              onRate={(rating) => {
                const elapsed = Date.now() - startMs;
                submit(rating, result?.objective?.correct ?? null, elapsed);
              }}
              disabled={busy}
            />
          </>
        )}
        {revealed && answered && result?.outcome && (
          <div className="flex items-center justify-between rounded-xl border border-border bg-secondary/50 px-4 py-3 text-sm">
            <span className="font-semibold text-foreground">
              Next review {intervalLabel(result.outcome.intervalDays)}
            </span>
            <span className="flex items-center gap-1 text-xs text-muted">
              Retention {Math.round(result.outcome.retention * 100)}%
              <LuArrowRight className="h-3.5 w-3.5" />
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function isObjectiveCard(card: StudyCardState | undefined): boolean {
  return (
    card?.cardType === "FILL_IN_BLANK" || card?.cardType === "TRUE_FALSE"
  );
}
