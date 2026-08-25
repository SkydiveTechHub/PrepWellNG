"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LuTrash2, LuLayers, LuTriangleAlert } from "react-icons/lu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CARD_TYPE_LABEL, type FlashcardType } from "@/lib/flashcard-content";

export type DeckCard = {
  id: string;
  cardType: string;
  prompt: string | null;
  difficulty: string;
  orderIndex: number;
};

function typeLabel(cardType: string): string {
  return CARD_TYPE_LABEL[cardType as FlashcardType] ?? cardType;
}

/**
 * The deck's full card list. Separate from the study session, which only shows
 * what is due today — you cannot prune a deck you cannot see.
 *
 * Deleting is owner-only and confirmed in place rather than through
 * window.confirm: the consequence is worth a sentence, and a native dialog has
 * no room for one.
 */
export function DeckCards({
  cards,
  isOwner,
  fromLesson,
}: {
  cards: DeckCard[];
  isOwner: boolean;
  /** Built from a lesson, so a removed card returns on the next re-sync. */
  fromLesson: boolean;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function remove(cardId: string) {
    setBusy(cardId);
    setError(null);
    try {
      const res = await fetch(`/api/flashcards/cards/${cardId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Couldn’t remove that card.");
        return;
      }
      setConfirming(null);
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  if (cards.length === 0) {
    return (
      <p className="text-sm text-muted">This deck has no cards.</p>
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <p className="rounded-lg border border-danger/30 bg-danger-soft/40 px-3 py-2 text-sm font-medium text-danger">
          {error}
        </p>
      )}

      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
        {cards.map((card) => {
          const isConfirming = confirming === card.id;
          return (
            <li
              key={card.id}
              className={cn(
                "px-4 py-3 transition-colors",
                isConfirming && "bg-danger-soft/30",
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-secondary text-muted">
                    <LuLayers className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {card.prompt ?? "Untitled card"}
                    </p>
                    <Badge variant="neutral" className="mt-1">
                      {typeLabel(card.cardType)}
                    </Badge>
                  </div>
                </div>

                {isOwner && !isConfirming && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => {
                      setConfirming(card.id);
                      setError(null);
                    }}
                    aria-label={`Remove ${card.prompt ?? "this card"}`}
                    className="flex-shrink-0 text-muted hover:text-danger"
                  >
                    <LuTrash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>

              {isConfirming && (
                <div className="mt-3 space-y-2 border-t border-danger/20 pt-3">
                  <p className="flex items-start gap-2 text-xs leading-relaxed text-muted">
                    <LuTriangleAlert className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-warning" />
                    <span>
                      Removing this card deletes its review history for everyone
                      studying the deck.
                      {fromLesson &&
                        " It will come back if you re-sync this lesson."}
                    </span>
                  </p>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="danger"
                      size="sm"
                      onClick={() => remove(card.id)}
                      disabled={busy === card.id}
                    >
                      {busy === card.id ? "Removing…" : "Remove card"}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setConfirming(null)}
                      disabled={busy === card.id}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
