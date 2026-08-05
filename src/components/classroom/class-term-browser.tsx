"use client";

import { useState } from "react";
import Link from "next/link";
import { LuBookOpen, LuCheck } from "react-icons/lu";
import { cn } from "@/lib/utils";
import { buttonClass } from "@/components/ui/button";
import { CLASS_LEVELS, TERMS, TERM_LABELS, type ClassLevel, type Term } from "@/lib/curriculum-scope";

// Classroom — class/term browser (spec Task 4). Replaces the accordion list
// slot on the subject page: a sticky class tab set plus the three terms for
// whichever class is selected, so a student lands on their own class with
// zero taps and can still page through the rest of the syllabus.

export type BrowserTopic = {
  slug: string;
  title: string;
  completed: boolean;
};

export type ClassGroup = {
  classLevel: string;
  terms: { term: string; topics: BrowserTopic[] }[];
};

export function ClassTermBrowser({
  subjectSlug,
  classes,
  initialClassLevel,
  practiceHref,
}: {
  subjectSlug: string;
  classes: ClassGroup[];
  initialClassLevel: ClassLevel;
  practiceHref: (classLevel: string) => string;
}) {
  const [selectedClass, setSelectedClass] = useState<string>(initialClassLevel);

  const byLevel = new Map(classes.map((group) => [group.classLevel, group]));
  const current = byLevel.get(selectedClass);

  return (
    <div>
      <div className="sticky top-14 sticky-chrome -mx-4 px-4 pb-4 sm:-mx-6 sm:px-6">
        <div
          className="flex rounded-xl border border-border bg-card p-1"
          aria-label="Class level"
        >
          {CLASS_LEVELS.map((level) => {
            const group = byLevel.get(level);
            const hasTopics = (group?.terms.flatMap((t) => t.topics).length ?? 0) > 0;
            const selected = selectedClass === level;

            return (
              <button
                key={level}
                type="button"
                aria-pressed={selected}
                disabled={!hasTopics}
                onClick={() => setSelectedClass(level)}
                className={cn(
                  "flex-1 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors",
                  selected
                    ? "bg-primary text-primary-foreground shadow-soft"
                    : "text-muted hover:text-foreground",
                  !hasTopics && "cursor-not-allowed opacity-40 hover:text-muted",
                )}
              >
                {level}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
        {TERMS.map((term: Term) => {
          const topics = current?.terms.find((t) => t.term === term)?.topics ?? [];
          const done = topics.filter((t) => t.completed).length;

          return (
            <div key={term} className="rounded-xl border border-border bg-card p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="section-label mb-0">{TERM_LABELS[term]}</h3>
                {topics.length > 0 && (
                  <span className="text-[11px] font-semibold text-muted">
                    {done}/{topics.length} done
                  </span>
                )}
              </div>

              {topics.length === 0 ? (
                <p className="text-xs text-muted">No topics yet</p>
              ) : (
                <div className="space-y-2">
                  {topics.map((topic) => (
                    <Link
                      key={topic.slug}
                      href={`/classroom/${subjectSlug}/${topic.slug}`}
                      className="group/topic flex items-center justify-between gap-3 rounded-xl border border-border p-3 transition-all hover:border-primary/40 hover:shadow-soft"
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <LuBookOpen className="h-3.5 w-3.5 flex-shrink-0 text-muted transition-colors group-hover/topic:text-primary" />
                        <span className="truncate text-sm font-medium text-foreground">
                          {topic.title}
                        </span>
                      </div>
                      {topic.completed && (
                        <LuCheck className="h-3.5 w-3.5 flex-shrink-0 text-tone-green-ink" />
                      )}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex justify-end">
        <Link href={practiceHref(selectedClass)} className={buttonClass("primary", "md")}>
          Practice {selectedClass}
        </Link>
      </div>
    </div>
  );
}
