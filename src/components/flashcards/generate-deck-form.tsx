"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  LuSparkles,
  LuWandSparkles,
  LuSearch,
  LuRefreshCw,
  LuArrowRight,
  LuTriangleAlert,
} from "react-icons/lu";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { CARD_TYPE_LABEL, type FlashcardType } from "@/lib/flashcard-content";

type CompletedLesson = {
  lessonId: string;
  title: string;
  subjectName: string;
  topicTitle: string;
  deck: { id: string; cardCount: number } | null;
};

type DeckPreview = {
  exists: boolean;
  total: number;
  byType: { cardType: string; count: number }[];
  counts: { unchanged: number; updated: number; created: number; removed: number };
  samples: { cardType: string; prompt: string }[];
};

type BuildResult = {
  deck: { id: string };
  counts: DeckPreview["counts"];
  cardCount: number;
};

function typeLabel(cardType: string): string {
  return CARD_TYPE_LABEL[cardType as FlashcardType] ?? cardType;
}

export function GenerateDeckForm({ lessons }: { lessons: CompletedLesson[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<CompletedLesson | null>(null);
  const [preview, setPreview] = useState<DeckPreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BuildResult | null>(null);

  // Grouped subject → topic, so a long list stays navigable.
  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matches = needle
      ? lessons.filter((l) =>
          `${l.title} ${l.topicTitle} ${l.subjectName}`.toLowerCase().includes(needle),
        )
      : lessons;

    const bySubject = new Map<string, Map<string, CompletedLesson[]>>();
    for (const lesson of matches) {
      const topics =
        bySubject.get(lesson.subjectName) ?? new Map<string, CompletedLesson[]>();
      topics.set(lesson.topicTitle, [...(topics.get(lesson.topicTitle) ?? []), lesson]);
      bySubject.set(lesson.subjectName, topics);
    }
    return [...bySubject.entries()].map(([subjectName, topics]) => ({
      subjectName,
      topics: [...topics.entries()].map(([topicTitle, items]) => ({ topicTitle, items })),
    }));
  }, [lessons, query]);

  async function choose(lesson: CompletedLesson) {
    setSelected(lesson);
    setPreview(null);
    setResult(null);
    setError(null);
    setPreviewing(true);
    try {
      const res = await fetch(
        `/api/flashcards/preview?lessonId=${encodeURIComponent(lesson.lessonId)}`,
      );
      if (!res.ok) throw new Error("failed");
      setPreview((await res.json()) as DeckPreview);
    } catch {
      setError("Couldn’t preview this lesson. You can still build it.");
    } finally {
      setPreviewing(false);
    }
  }

  async function build() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/flashcards/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lessonId: selected.lessonId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to build deck");
        return;
      }
      setResult(data as BuildResult);
      setPreview(null);
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (lessons.length === 0) {
    return (
      <p className="text-xs text-muted">
        Finish a lesson first — its concepts, mistakes and examples become your cards.
      </p>
    );
  }

  const existing = preview?.exists ?? selected?.deck != null;

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <LuSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          type="search"
          className="input pl-9"
          placeholder="Search your finished lessons…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search finished lessons"
        />
      </div>

      {/* Lesson list */}
      <div className="max-h-72 overflow-y-auto rounded-xl border border-border">
        {groups.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted">
            No finished lesson matches “{query}”.
          </p>
        ) : (
          groups.map((group) => (
            <div key={group.subjectName}>
              <p className="sticky top-0 bg-secondary px-4 py-1.5 text-xs font-bold text-secondary-foreground">
                {group.subjectName}
              </p>
              {group.topics.map((topic) => (
                <div key={topic.topicTitle}>
                  <p className="px-4 pt-2 text-xs font-semibold text-muted">
                    {topic.topicTitle}
                  </p>
                  {topic.items.map((lesson) => (
                    <button
                      key={lesson.lessonId}
                      type="button"
                      onClick={() => choose(lesson)}
                      aria-pressed={selected?.lessonId === lesson.lessonId}
                      className={cn(
                        "flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm transition-colors",
                        selected?.lessonId === lesson.lessonId
                          ? "bg-primary-soft font-semibold text-primary"
                          : "hover:bg-secondary",
                      )}
                    >
                      <span className="min-w-0 truncate">{lesson.title}</span>
                      {lesson.deck && (
                        <Badge className="flex-shrink-0">
                          Already built · {lesson.deck.cardCount} cards
                        </Badge>
                      )}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          ))
        )}
      </div>

      {/* Preview */}
      {selected && previewing && <Spinner className="py-4" />}

      {selected && preview && !previewing && (
        <div className="rounded-xl border border-border bg-secondary/40 p-4">
          <p className="text-sm font-bold text-foreground">
            {preview.total} card{preview.total === 1 ? "" : "s"} from “{selected.title}”
          </p>

          <div className="mt-2 flex flex-wrap gap-1.5">
            {preview.byType.map((t) => (
              <Badge key={t.cardType}>
                {t.count} × {typeLabel(t.cardType)}
              </Badge>
            ))}
          </div>

          {existing && (
            <div className="mt-3 space-y-1.5 border-t border-border pt-3">
              <p className="text-sm">
                <span className="font-bold text-success">
                  {preview.counts.unchanged} card
                  {preview.counts.unchanged === 1 ? "" : "s"} unchanged
                </span>
                <span className="text-muted"> — your progress is kept</span>
                <span className="text-muted">
                  {" · "}
                  {preview.counts.updated} updated · {preview.counts.created} new
                </span>
              </p>
              {preview.counts.removed > 0 && (
                <p className="flex items-start gap-2 text-sm text-warning">
                  <LuTriangleAlert className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  <span>
                    {preview.counts.removed} card
                    {preview.counts.removed === 1 ? "" : "s"} no longer in the lesson will be
                    removed, along with their review history.
                  </span>
                </p>
              )}
            </div>
          )}

          {preview.samples.length > 0 && (
            <ul className="mt-3 space-y-1 border-t border-border pt-3">
              {preview.samples.map((s, i) => (
                <li key={`${s.prompt}-${i}`} className="truncate text-xs text-muted">
                  <span className="font-semibold">{typeLabel(s.cardType)}:</span> {s.prompt}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Action */}
      <Button
        type="button"
        onClick={build}
        disabled={busy || !selected || preview?.total === 0}
      >
        {existing ? (
          <LuRefreshCw className="h-4 w-4" />
        ) : (
          <LuWandSparkles className="h-4 w-4" />
        )}
        {busy
          ? existing
            ? "Re-syncing…"
            : "Building…"
          : existing
            ? "Re-sync deck"
            : "Build cards"}
      </Button>

      {error && (
        <p className="rounded-lg border border-danger/30 bg-danger-soft/40 px-3 py-2 text-sm font-medium text-danger">
          {error}
        </p>
      )}

      {/* Result */}
      {result && (
        <div className="rounded-xl border border-success/30 bg-success-soft/50 p-4">
          <p className="text-sm font-semibold text-success">
            <LuSparkles className="mr-1 inline h-3.5 w-3.5" />
            {result.counts.created > 0 && `${result.counts.created} new · `}
            {result.counts.updated > 0 && `${result.counts.updated} updated · `}
            {result.counts.unchanged > 0 && `${result.counts.unchanged} kept · `}
            {result.cardCount} card{result.cardCount === 1 ? "" : "s"} in the deck.
          </p>
          <Link
            href={`/flashcards/${result.deck.id}`}
            className="mt-3 inline-flex items-center gap-2 text-sm font-bold text-primary hover:underline"
          >
            Study now
            <LuArrowRight className="h-4 w-4" />
          </Link>
        </div>
      )}
    </div>
  );
}
