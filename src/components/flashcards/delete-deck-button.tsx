"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LuTrash2, LuTriangleAlert } from "react-icons/lu";
import { Button } from "@/components/ui/button";

/**
 * Removes a deck from the student's list — which, for a deck they created,
 * means deleting it. They are not enrolled in their own deck, so there is no
 * unfollow to offer instead.
 *
 * The confirmation states both consequences: the review history is gone, and a
 * lesson deck has to be rebuilt from the lesson to come back. `followerCount`
 * is surfaced when it is non-zero so the decision is informed rather than
 * silent — other students lose their schedules too.
 */
export function DeleteDeckButton({
  deckId,
  deckTitle,
  followerCount,
  fromLesson,
}: {
  deckId: string;
  deckTitle: string;
  followerCount: number;
  fromLesson: boolean;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/flashcards/decks/${deckId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Couldn’t delete this deck.");
        return;
      }
      router.push("/flashcards");
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!confirming) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setConfirming(true)}
        className="text-muted hover:text-danger"
      >
        <LuTrash2 className="h-4 w-4" />
        Delete deck
      </Button>
    );
  }

  return (
    <div className="rounded-xl border border-danger/30 bg-danger-soft/30 p-4">
      <p className="flex items-start gap-2 text-sm font-semibold text-foreground">
        <LuTriangleAlert className="mt-0.5 h-4 w-4 flex-shrink-0 text-danger" />
        <span>Delete “{deckTitle}”?</span>
      </p>
      <ul className="mt-2 space-y-1 pl-6 text-xs leading-relaxed text-muted">
        <li>Every card in it goes, along with your review history.</li>
        {followerCount > 0 && (
          <li className="font-semibold text-warning">
            {followerCount} other student{followerCount === 1 ? "" : "s"}{" "}
            {followerCount === 1 ? "is" : "are"} studying this deck. They lose
            their cards and their progress too.
          </li>
        )}
        <li>
          {fromLesson
            ? "You can build it again from the lesson, but it starts fresh."
            : "This cannot be undone."}
        </li>
      </ul>

      {error && (
        <p className="mt-3 text-sm font-medium text-danger">{error}</p>
      )}

      <div className="mt-3 flex gap-2">
        <Button
          type="button"
          variant="danger"
          size="sm"
          onClick={remove}
          disabled={busy}
        >
          {busy ? "Deleting…" : "Delete deck"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setConfirming(false)}
          disabled={busy}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
