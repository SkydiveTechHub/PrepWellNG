"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  LuClipboardCheck,
  LuLayers,
  LuLoader,
  LuNotebookPen,
  LuTarget,
} from "react-icons/lu";
import { buttonClass } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// The topic page's single call-to-action row. Sticky once the note scrolls
// past it, so a student is never more than a tap away from the four things
// they can do with this topic: study the cards, quiz themselves, drill
// flashcards, or take the timed practice test.

export function TopicActionBar({
  subjectSlug,
  topicSlug,
  lessonId,
  hasDeck,
  deckId,
  canPractice,
}: {
  subjectSlug: string;
  topicSlug: string;
  lessonId: string | null;
  hasDeck: boolean;
  deckId: string | null;
  /**
   * False until the student has started the lesson's cards — the practice
   * test scores against checkpoint data that doesn't exist yet. The page
   * still enforces this server-side on `/practice` itself; this only keeps
   * the button from silently bouncing an unprepared student there.
   */
  canPractice: boolean;
}) {
  const router = useRouter();
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const studyHref = `/classroom/${subjectSlug}/${topicSlug}/study`;
  const quizHref = `/classroom/${subjectSlug}/${topicSlug}/quiz`;
  const practiceHref = `/classroom/${subjectSlug}/${topicSlug}/practice`;

  async function handleFlashcards() {
    if (hasDeck) {
      router.push(deckId ? `/flashcards/${deckId}` : "/flashcards");
      return;
    }
    if (!lessonId || generating) return;
    setError(null);
    setGenerating(true);
    try {
      const res = await fetch("/api/flashcards/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lessonId }),
      });
      if (!res.ok) throw new Error("Failed to build the deck");
      const data = await res.json();
      router.push(`/flashcards/${data.deck.id}`);
    } catch {
      setError("Couldn't build the flashcard deck. Try again.");
      setGenerating(false);
    }
  }

  return (
    <div className="sticky top-14 z-10 sticky-chrome -mx-4 px-4 py-3 sm:-mx-6 sm:px-6">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={studyHref} className={buttonClass("primary", "md")}>
          <LuNotebookPen className="h-4 w-4" />
          Study step by step
        </Link>
        <Link href={quizHref} className={buttonClass("outline", "md")}>
          <LuTarget className="h-4 w-4" />
          Quick quiz
        </Link>
        <button
          type="button"
          onClick={handleFlashcards}
          disabled={!lessonId || generating}
          className={cn(buttonClass("outline", "md"))}
        >
          {generating ? (
            <LuLoader className="h-4 w-4 animate-spin" />
          ) : (
            <LuLayers className="h-4 w-4" />
          )}
          {hasDeck ? "Flashcards" : "Build flashcards"}
        </button>
        {canPractice ? (
          <Link href={practiceHref} className={buttonClass("outline", "md")}>
            <LuClipboardCheck className="h-4 w-4" />
            Practice
          </Link>
        ) : (
          <button
            type="button"
            disabled
            title="Study the lesson first to unlock the practice test"
            className={cn(buttonClass("outline", "md"), "cursor-not-allowed")}
          >
            <LuClipboardCheck className="h-4 w-4" />
            Practice
          </button>
        )}
      </div>
      {!canPractice && (
        <p className="mt-2 text-xs text-muted">
          Study the lesson first to unlock the practice test.
        </p>
      )}
      {error && <p className="mt-2 text-xs font-medium text-danger">{error}</p>}
    </div>
  );
}
