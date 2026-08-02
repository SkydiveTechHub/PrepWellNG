"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LuSparkles, LuWandSparkles } from "react-icons/lu";
import { Button } from "@/components/ui/button";

type CompletedLesson = {
  lessonId: string;
  title: string;
};

type GenerateDeckFormProps = {
  lessons: CompletedLesson[];
};

export function GenerateDeckForm({ lessons }: GenerateDeckFormProps) {
  const router = useRouter();
  const [lessonId, setLessonId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function generate(e: React.FormEvent) {
    e.preventDefault();
    if (!lessonId) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/flashcards/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lessonId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to generate deck");
        return;
      }
      setSuccess(
        `Deck created with ${data.cardCount} card${data.cardCount === 1 ? "" : "s"}.`,
      );
      setLessonId("");
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={generate} className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <label htmlFor="lesson-picker" className="label">
            Completed lesson
          </label>
          <select
            id="lesson-picker"
            className="input"
            value={lessonId}
            onChange={(e) => setLessonId(e.target.value)}
            disabled={busy || lessons.length === 0}
          >
            <option value="">Pick a lesson you finished…</option>
            {lessons.map((lesson) => (
              <option key={lesson.lessonId} value={lesson.lessonId}>
                {lesson.title}
              </option>
            ))}
          </select>
        </div>
        <Button
          type="submit"
          disabled={busy || !lessonId}
          className="flex-shrink-0"
        >
          <LuWandSparkles className="h-4 w-4" />
          {busy ? "Generating…" : "Build cards"}
        </Button>
      </div>

      {error && (
        <p className="rounded-lg border border-danger/30 bg-danger-soft/40 px-3 py-2 text-sm font-medium text-danger">
          {error}
        </p>
      )}
      {success && (
        <p className="rounded-lg border border-success/30 bg-success-soft/50 px-3 py-2 text-sm font-medium text-success">
          <LuSparkles className="mr-1 inline h-3.5 w-3.5" />
          {success}
        </p>
      )}

      {lessons.length === 0 && (
        <p className="text-xs text-muted">
          Finish a lesson first — its concepts, mistakes and examples become your cards.
        </p>
      )}
    </form>
  );
}
