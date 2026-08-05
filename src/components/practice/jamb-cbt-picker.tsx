"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  LuLock,
  LuCheck,
  LuTriangleAlert,
  LuArrowRight,
  LuCalendarDays,
  LuInfo,
} from "react-icons/lu";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { JAMB_SPEC } from "@/lib/jamb-cbt";

export type PickerSubject = {
  id: string;
  code: string;
  name: string;
  eligibleYears: number[];
};

export function JambCbtPicker({
  english,
  englishYears,
  subjects,
}: {
  english: { id: string; code: string; name: string } | null;
  englishYears: number[];
  subjects: PickerSubject[];
}) {
  const router = useRouter();
  const [chosen, setChosen] = useState<string[]>([]);
  const [year, setYear] = useState<number | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");

  const chosenSubjects = useMemo(
    () => subjects.filter((s) => chosen.includes(s.id)),
    [subjects, chosen],
  );

  // A sitting is one year across all four papers, so only years covered by
  // English *and* every chosen subject can be offered.
  const availableYears = useMemo(() => {
    if (chosenSubjects.length !== JAMB_SPEC.otherSubjectCount) return [];
    return englishYears
      .filter((y) => chosenSubjects.every((s) => s.eligibleYears.includes(y)))
      .sort((a, b) => b - a);
  }, [englishYears, chosenSubjects]);

  function toggle(id: string) {
    setError("");
    setChosen((prev) => {
      if (prev.includes(id)) return prev.filter((s) => s !== id);
      if (prev.length >= JAMB_SPEC.otherSubjectCount) return prev;
      return [...prev, id];
    });
    setYear(null);
  }

  async function start() {
    if (!year || chosen.length !== JAMB_SPEC.otherSubjectCount) return;
    setStarting(true);
    setError("");
    try {
      const res = await fetch("/api/assessments/jamb-cbt/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subjectIds: chosen, examYear: year }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Couldn't start the exam. Please try again.");
        setStarting(false);
        return;
      }
      const params = new URLSearchParams({
        year: String(year),
        subjects: chosen.join(","),
      });
      router.push(`/practice/cbt/session?${params.toString()}`);
    } catch {
      setError("Network error. Please check your connection and try again.");
      setStarting(false);
    }
  }

  const remaining = JAMB_SPEC.otherSubjectCount - chosen.length;
  const noEnglish = !english || englishYears.length === 0;

  return (
    <div className="space-y-6">
      {/* Compulsory paper */}
      <section className="card p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-soft text-primary">
              <LuLock className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-bold text-foreground">
                {english?.name ?? "English Language"}
              </p>
              <p className="text-xs text-muted">
                Compulsory · {JAMB_SPEC.englishQuestions} questions
              </p>
            </div>
          </div>
          <Badge variant="blue">Added for you</Badge>
        </div>
      </section>

      {noEnglish && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-xl border border-warning/25 bg-warning-soft px-4 py-3 text-sm text-warning"
        >
          <LuTriangleAlert className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <div>
            <p className="font-semibold">
              The English Language paper isn&apos;t available yet.
            </p>
            <p className="mt-0.5 leading-relaxed">
              English is compulsory in JAMB and makes up{" "}
              {JAMB_SPEC.englishQuestions} of the {JAMB_SPEC.totalQuestions}{" "}
              questions, so no sitting can be assembled until it&apos;s loaded
              into the question bank.
            </p>
          </div>
        </div>
      )}

      {/* Subject choice */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="section-label">
            Choose {JAMB_SPEC.otherSubjectCount} more subjects
          </h2>
          <span className="text-xs font-semibold text-muted">
            {remaining > 0
              ? `${remaining} to go`
              : `${JAMB_SPEC.subjectCount} subjects selected`}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3">
          {subjects.map((subject) => {
            const selected = chosen.includes(subject.id);
            const full =
              !selected && chosen.length >= JAMB_SPEC.otherSubjectCount;
            const unavailable = subject.eligibleYears.length === 0;

            return (
              <button
                key={subject.id}
                type="button"
                onClick={() => toggle(subject.id)}
                disabled={full || unavailable}
                aria-pressed={selected}
                className={cn(
                  "relative rounded-xl border p-3.5 text-left transition-all",
                  selected
                    ? "border-primary bg-primary-soft ring-4 ring-primary/15"
                    : "border-border bg-card hover:border-primary/40",
                  (full || unavailable) && "opacity-45",
                  !full && !unavailable && "cursor-pointer",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-bold text-foreground">
                    {subject.name}
                  </span>
                  {selected && (
                    <LuCheck className="h-4 w-4 flex-shrink-0 text-primary" />
                  )}
                </div>
                <p className="mt-1 text-xs text-muted">
                  {unavailable
                    ? "No complete paper yet"
                    : `${subject.eligibleYears.length} year${subject.eligibleYears.length === 1 ? "" : "s"} available`}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      {/* Year choice */}
      {chosen.length === JAMB_SPEC.otherSubjectCount && (
        <section className="animate-slide-up">
          <h2 className="section-label mb-3">Choose the year</h2>

          {availableYears.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {availableYears.map((y) => (
                <button
                  key={y}
                  type="button"
                  onClick={() => setYear(y)}
                  aria-pressed={year === y}
                  className={cn(
                    "flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-sm font-bold transition-colors",
                    year === y
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card text-foreground hover:border-primary/40",
                  )}
                >
                  <LuCalendarDays className="h-3.5 w-3.5" />
                  {y}
                </button>
              ))}
            </div>
          ) : (
            <div className="flex items-start gap-2.5 rounded-xl border border-warning/25 bg-warning-soft px-4 py-3 text-sm text-warning">
              <LuTriangleAlert className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <div>
                <p className="font-semibold">
                  No year has a complete paper for this combination.
                </p>
                <p className="mt-0.5 leading-relaxed">
                  Every subject needs its full complement from the same sitting —{" "}
                  {JAMB_SPEC.englishQuestions} English and{" "}
                  {JAMB_SPEC.otherQuestions} each for the rest. Try a different
                  combination.
                </p>
              </div>
            </div>
          )}
        </section>
      )}

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-xl border border-danger/25 bg-danger-soft px-4 py-3 text-sm font-medium text-danger"
        >
          <LuTriangleAlert className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
        <p className="flex items-center gap-1.5 text-xs text-muted">
          <LuInfo className="h-3.5 w-3.5" />
          {JAMB_SPEC.totalQuestions} questions · {JAMB_SPEC.durationMinutes}{" "}
          minutes · marked out of {JAMB_SPEC.totalMarks}
        </p>
        <Button
          onClick={start}
          disabled={!year || starting}
          size="lg"
        >
          {starting ? "Preparing your paper…" : "Start exam"}
          {!starting && <LuArrowRight className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}
