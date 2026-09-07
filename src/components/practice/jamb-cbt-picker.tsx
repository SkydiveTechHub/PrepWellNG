"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  LuLock,
  LuCheck,
  LuTriangleAlert,
  LuArrowRight,
  LuCalendarDays,
  LuInfo,
  LuDownload,
} from "react-icons/lu";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { JAMB_SPEC } from "@/lib/jamb-cbt";
import { examYearRange } from "@/lib/exam-years";
import { Spinner } from "@/components/ui/spinner";

/** What the bank holds for one subject in the chosen year. */
type Requirement = {
  subjectId: string;
  subjectName: string;
  required: number;
  available: number;
};

type Preparation = {
  ready: boolean;
  message: string | null;
  coverage: Requirement[];
};

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
  const [preparing, setPreparing] = useState(false);
  const [prep, setPrep] = useState<Preparation | null>(null);
  // Only the newest year's answer may land: a student clicking through years
  // faster than the provider responds must not see an older year's coverage.
  const prepRun = useRef(0);

  const chosenSubjects = useMemo(
    () => subjects.filter((s) => chosen.includes(s.id)),
    [subjects, chosen],
  );

  // A sitting is one year across all four papers, so a year is sittable
  // straight away only when English *and* every chosen subject already cover it.
  const readyYears = useMemo(() => {
    if (chosenSubjects.length !== JAMB_SPEC.otherSubjectCount) {
      return new Set<number>();
    }
    return new Set(
      englishYears.filter((y) =>
        chosenSubjects.every((s) => s.eligibleYears.includes(y)),
      ),
    );
  }, [englishYears, chosenSubjects]);

  // Every year is offered, not just the covered ones: picking one pulls its
  // four papers from the provider. Restricting the list to what the bank
  // already held made a year nobody could pick a year nobody ever fetched.
  const years = useMemo(
    () =>
      examYearRange([
        ...englishYears,
        ...subjects.flatMap((s) => s.eligibleYears),
      ]),
    [englishYears, subjects],
  );

  // Pull the four papers for the chosen year and report what the bank now
  // holds. Runs on selection so the wait and any shortfall land here, in front
  // of the year grid, rather than behind "Start exam".
  const prepare = useCallback(async (chosenYear: number, subjectIds: string[]) => {
    const run = ++prepRun.current;
    setPreparing(true);
    setPrep(null);
    setError("");
    try {
      const res = await fetch("/api/assessments/jamb-cbt/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subjectIds, examYear: chosenYear }),
      });
      const data = await res.json().catch(() => ({}));
      if (run !== prepRun.current) return;
      if (!res.ok) {
        setError(data.error || "Couldn't check that year. Please try again.");
        return;
      }
      setPrep({
        ready: data.ready,
        message: data.message ?? null,
        coverage: data.coverage ?? [],
      });
    } catch {
      if (run === prepRun.current) {
        setError("Network error. Please check your connection and try again.");
      }
    } finally {
      if (run === prepRun.current) setPreparing(false);
    }
  }, []);

  /** Drops any selected year and the coverage report that went with it. */
  function clearYear() {
    prepRun.current++;
    setYear(null);
    setPrep(null);
    setPreparing(false);
  }

  // A year the bank already covers needs no round trip; anything else is
  // prepared the moment it is picked.
  function selectYear(chosenYear: number) {
    setYear(chosenYear);
    setError("");
    if (readyYears.has(chosenYear)) {
      prepRun.current++;
      setPrep({ ready: true, message: null, coverage: [] });
      setPreparing(false);
      return;
    }
    prepare(chosenYear, chosen);
  }

  function toggle(id: string) {
    setError("");
    setChosen((prev) => {
      if (prev.includes(id)) return prev.filter((s) => s !== id);
      if (prev.length >= JAMB_SPEC.otherSubjectCount) return prev;
      return [...prev, id];
    });
    // The chosen year's coverage was measured against the old combination.
    clearYear();
  }

  const ready = prep?.ready === true;

  async function start() {
    if (!year || !ready || chosen.length !== JAMB_SPEC.otherSubjectCount) return;
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
  const noEnglish = !english;

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
              English Language isn&apos;t set up yet.
            </p>
            <p className="mt-0.5 leading-relaxed">
              English is compulsory in JAMB and makes up{" "}
              {JAMB_SPEC.englishQuestions} of the {JAMB_SPEC.totalQuestions}{" "}
              questions, so no sitting can be assembled until it&apos;s added to
              the subject catalogue.
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

            return (
              <button
                key={subject.id}
                type="button"
                onClick={() => toggle(subject.id)}
                disabled={full}
                aria-pressed={selected}
                className={cn(
                  "relative rounded-xl border p-3.5 text-left transition-all",
                  selected
                    ? "border-primary bg-primary-soft ring-4 ring-primary/15"
                    : "border-border bg-card hover:border-primary/40",
                  full && "opacity-45",
                  !full && "cursor-pointer",
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
                  {subject.eligibleYears.length === 0
                    ? "Loads on demand"
                    : `${subject.eligibleYears.length} year${subject.eligibleYears.length === 1 ? "" : "s"} ready`}
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

          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-6">
            {years.map((y) => {
              const sittable = readyYears.has(y);
              return (
                <button
                  key={y}
                  type="button"
                  onClick={() => selectYear(y)}
                  aria-pressed={year === y}
                  className={cn(
                    "flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-sm font-bold transition-colors",
                    year === y
                      ? "border-primary bg-primary text-primary-foreground"
                      : sittable
                        ? "border-success/40 bg-success-soft text-success hover:border-success"
                        : "border-border bg-card text-foreground hover:border-primary/40",
                  )}
                >
                  {sittable && <LuCalendarDays className="h-3.5 w-3.5" />}
                  {y}
                </button>
              );
            })}
          </div>

          {/* What picking a year actually did. */}
          <div className="mt-3">
            {preparing ? (
              <Spinner label={`Preparing the ${year} papers...`} />
            ) : ready ? (
              <p className="flex items-center gap-1.5 text-sm font-semibold text-success">
                <LuCheck className="h-4 w-4" />
                The {year} paper is ready to sit.
              </p>
            ) : prep ? (
              <div className="flex items-start gap-2.5 rounded-xl border border-warning/25 bg-warning-soft px-4 py-3 text-sm text-warning">
                <LuTriangleAlert className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    The {year} paper isn&apos;t complete yet.
                  </p>
                  <p className="mt-0.5 leading-relaxed">
                    Every subject needs its full complement from the same
                    sitting.
                  </p>
                  <ul className="mt-2 space-y-1">
                    {prep.coverage.map((r) => (
                      <li
                        key={r.subjectId}
                        className="flex items-center justify-between gap-3"
                      >
                        <span className="truncate">{r.subjectName}</span>
                        <span className="flex-shrink-0 font-mono text-xs font-bold">
                          {Math.min(r.available, r.required)}/{r.required}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    onClick={() => year !== null && prepare(year, chosen)}
                    className="mt-2.5 font-semibold underline underline-offset-2"
                  >
                    Load more questions for {year}
                  </button>
                </div>
              </div>
            ) : (
              <p className="flex items-start gap-1.5 text-xs text-muted">
                <LuDownload className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                Ticked years are ready now. Any other year is pulled from the
                question bank when you pick it.
              </p>
            )}
          </div>
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
          disabled={!year || !ready || preparing || starting}
          size="lg"
        >
          {starting ? "Preparing your paper…" : "Start exam"}
          {!starting && <LuArrowRight className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}
