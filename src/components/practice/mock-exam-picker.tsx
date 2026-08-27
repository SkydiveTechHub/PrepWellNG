"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  LuArrowRight,
  LuTriangleAlert,
  LuInfo,
  LuLayers,
  LuCheck,
} from "react-icons/lu";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { isComingSoonBoard } from "@/lib/constants/exam-types";
import {
  CLASS_LEVELS,
  TERMS,
  TERM_LABELS,
  describeScopeRange,
  expandScopeRange,
  scopeOrdinal,
  type ScopePoint,
} from "@/lib/curriculum-scope";

type ScopeCount = { classLevel: string; term: string; count: number };

type SubjectAvailability = {
  id: string;
  code: string;
  name: string;
  scopes: ScopeCount[];
  total: number;
};

const BOARDS = ["WAEC", "JAMB", "NECO"] as const;
type Board = (typeof BOARDS)[number];

const COUNT_OPTIONS = [20, 40, 60] as const;

export function MockExamPicker({
  initialSubjectId = null,
  initialFrom = null,
  initialTo = null,
}: {
  initialSubjectId?: string | null;
  initialFrom?: ScopePoint | null;
  initialTo?: ScopePoint | null;
} = {}) {
  const router = useRouter();

  const [board, setBoard] = useState<Board | null>(null);
  const [subjects, setSubjects] = useState<SubjectAvailability[]>([]);
  const [loadingSubjects, setLoadingSubjects] = useState(false);
  const [subjectId, setSubjectId] = useState<string | null>(null);

  const [useRange, setUseRange] = useState(false);
  const [from, setFrom] = useState<ScopePoint>({
    classLevel: "SS1",
    term: "FIRST",
  });
  const [to, setTo] = useState<ScopePoint>({
    classLevel: "SS1",
    term: "FIRST",
  });

  const [count, setCount] = useState<number>(40);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");

  // Deep-link pre-fill, held in reserve until a board is chosen: a subject
  // can't be resolved before then, since subjects are listed per board. The
  // reserve expresses an intent ("Biology, all of SS1") independent of which
  // board the student happens to try first — a board with no matching subject
  // is a dead end to back out of, not a rejection of the link. It is only
  // cleared once actually applied, or once the student manually picks a
  // different subject (an explicit choice supersedes the link). That means it
  // can carry across several board switches until it finds a home.
  const [pendingPrefill, setPendingPrefill] = useState<{
    subjectId: string;
    from: ScopePoint | null;
    to: ScopePoint | null;
  } | null>(initialSubjectId ? { subjectId: initialSubjectId, from: initialFrom, to: initialTo } : null);

  // Driven from the click rather than an effect on `board`: picking a board is
  // a user action, so the fetch belongs in the handler.
  const chooseBoard = useCallback(
    async (chosen: Board) => {
      setBoard(chosen);
      setSubjectId(null);
      setSubjects([]);
      setLoadingSubjects(true);
      setError("");
      try {
        const res = await fetch(
          `/api/assessments/mock-exam/options?examType=${chosen}`,
        );
        if (!res.ok) throw new Error("failed");
        const data = await res.json();
        const list: SubjectAvailability[] = data.subjects ?? [];
        setSubjects(list);

        if (pendingPrefill) {
          const match = list.find((s) => s.id === pendingPrefill.subjectId);
          if (match) {
            setSubjectId(match.id);
            // A subjectId with no scope params (or only some of them) is a
            // real, valid link: the subject is pre-selected and the scope
            // controls are simply left at their defaults.
            if (pendingPrefill.from) {
              setFrom(pendingPrefill.from);
              const rangeTo = pendingPrefill.to ?? pendingPrefill.from;
              setTo(rangeTo);
              setUseRange(
                scopeOrdinal(rangeTo) !== scopeOrdinal(pendingPrefill.from),
              );
            }
            setPendingPrefill(null);
          }
          // No match on this board: leave the reserve in place. It is not
          // spent yet — a later board may still have the subject.
        }
      } catch {
        setError("Couldn't load subjects. Please try again.");
        setSubjects([]);
      } finally {
        setLoadingSubjects(false);
      }
    },
    [pendingPrefill],
  );

  const subject = useMemo(
    () => subjects.find((s) => s.id === subjectId) ?? null,
    [subjects, subjectId],
  );

  /** Question counts per slot for the chosen subject, keyed "SS1:FIRST". */
  const countsBySlot = useMemo(() => {
    const map = new Map<string, number>();
    for (const scope of subject?.scopes ?? []) {
      map.set(`${scope.classLevel}:${scope.term}`, scope.count);
    }
    return map;
  }, [subject]);

  // A single term is just the range where both ends are the same slot.
  const effectiveTo = useRange ? to : from;

  const available = useMemo(() => {
    if (!subject) return 0;
    return expandScopeRange(from, effectiveTo).reduce(
      (sum, slot) =>
        sum + (countsBySlot.get(`${slot.classLevel}:${slot.term}`) ?? 0),
      0,
    );
  }, [subject, from, effectiveTo, countsBySlot]);

  const scopeText = describeScopeRange(from, effectiveTo);

  // Navigation only. The session page generates the paper, and that is the one
  // actually sat — posting here as well drew a whole second paper that was
  // thrown away unread, costing two round-trips and two rate-limit slots per
  // start. `available` already gates the empty-scope case from the counts the
  // picker holds, and a generation that does fail surfaces on the session
  // screen, which has a way back here.
  function start() {
    if (!board || !subjectId || available === 0) return;
    setStarting(true);
    setError("");
    const params = new URLSearchParams({
      examType: board,
      subjectId,
      fromClass: from.classLevel,
      fromTerm: from.term,
      toClass: effectiveTo.classLevel,
      toTerm: effectiveTo.term,
      count: String(Math.min(count, available)),
    });
    router.push(`/practice/mock-exam/session?${params.toString()}`);
  }

  return (
    <div className="space-y-8">
      {/* Board */}
      <section>
        <h2 className="section-label mb-3">1 · Choose the exam</h2>
        <div className="grid grid-cols-3 gap-3">
          {BOARDS.map((b) => {
            // Held back until the board has a syllabus-tagged bank of its own.
            const comingSoon = isComingSoonBoard(b);
            return (
              <button
                key={b}
                type="button"
                onClick={() => chooseBoard(b)}
                disabled={comingSoon}
                aria-pressed={board === b}
                className={cn(
                  "flex flex-col items-center justify-center gap-1.5 rounded-xl border py-4 text-sm font-bold transition-all",
                  comingSoon
                    ? "cursor-not-allowed border-border bg-muted/40 text-muted"
                    : board === b
                      ? "border-primary bg-primary-soft text-primary ring-4 ring-primary/15"
                      : "border-border bg-card text-foreground hover:border-primary/40",
                )}
              >
                {b}
                {comingSoon && <Badge>Coming soon</Badge>}
              </button>
            );
          })}
        </div>
      </section>

      {/* Subject */}
      {board && (
        <section className="animate-slide-up">
          <h2 className="section-label mb-3">2 · Choose the subject</h2>

          {loadingSubjects ? (
            <Spinner className="py-10" />
          ) : subjects.length === 0 ? (
            <div className="flex items-start gap-2.5 rounded-xl border border-warning/25 bg-warning-soft px-4 py-3 text-sm text-warning">
              <LuTriangleAlert className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span>
                No {board} questions are tagged to the syllabus yet, so no
                subject can be scoped by class and term.
              </span>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3">
              {subjects.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    setSubjectId(s.id);
                    // An explicit pick supersedes the deep link, whether or
                    // not it happens to be the linked subject.
                    setPendingPrefill(null);
                  }}
                  aria-pressed={subjectId === s.id}
                  className={cn(
                    "rounded-xl border p-3.5 text-left transition-all",
                    subjectId === s.id
                      ? "border-primary bg-primary-soft ring-4 ring-primary/15"
                      : "border-border bg-card hover:border-primary/40",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-bold text-foreground">
                      {s.name}
                    </span>
                    {subjectId === s.id && (
                      <LuCheck className="h-4 w-4 flex-shrink-0 text-primary" />
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {s.total} question{s.total === 1 ? "" : "s"} tagged
                  </p>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Scope */}
      {subject && (
        <section className="animate-slide-up">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="section-label">3 · Choose the syllabus scope</h2>
            <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-muted">
              <input
                type="checkbox"
                checked={useRange}
                onChange={(e) => {
                  setUseRange(e.target.checked);
                  if (e.target.checked) setTo(from);
                }}
                className="h-4 w-4 rounded border-border accent-[var(--app-primary)]"
              />
              Cover a range of terms
            </label>
          </div>

          <div className="card space-y-4 p-4">
            <ScopeSelect
              label={useRange ? "From" : "Class and term"}
              value={from}
              onChange={(next) => {
                setFrom(next);
                // Keep the range coherent when the start moves past the end.
                if (useRange && scopeOrdinal(next) > scopeOrdinal(to)) {
                  setTo(next);
                }
              }}
              countsBySlot={countsBySlot}
            />

            {useRange && (
              <ScopeSelect
                label="To"
                value={to}
                onChange={setTo}
                countsBySlot={countsBySlot}
              />
            )}

            <div className="flex items-center justify-between border-t border-border pt-3 text-sm">
              <span className="text-muted">
                Covering <span className="font-semibold text-foreground">{scopeText}</span>
              </span>
              <span
                className={cn(
                  "font-bold",
                  available === 0 ? "text-warning" : "text-foreground",
                )}
              >
                {available} question{available === 1 ? "" : "s"} available
              </span>
            </div>
          </div>
        </section>
      )}

      {/* Length */}
      {subject && available > 0 && (
        <section className="animate-slide-up">
          <h2 className="section-label mb-3">4 · How many questions?</h2>
          <div className="flex flex-wrap gap-2">
            {COUNT_OPTIONS.map((option) => {
              const capped = Math.min(option, available);
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => setCount(option)}
                  aria-pressed={count === option}
                  className={cn(
                    "rounded-xl border px-4 py-2 text-sm font-bold transition-colors",
                    count === option
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card text-foreground hover:border-primary/40",
                  )}
                >
                  {capped < option ? `${capped} (all available)` : option}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {subject && available === 0 && (
        <div className="flex items-start gap-2.5 rounded-xl border border-warning/25 bg-warning-soft px-4 py-3 text-sm text-warning">
          <LuTriangleAlert className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>
            No {board} {subject.name} questions are tagged to {scopeText} yet.
            Try a wider range or another term.
          </span>
        </div>
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
          Questions are drawn at random from {board ?? "the board"}&apos;s past
          papers for the topics in your chosen scope.
        </p>
        <Button
          onClick={start}
          size="lg"
          disabled={!subjectId || available === 0 || starting}
        >
          {starting ? "Building your exam…" : "Start mock exam"}
          {!starting && <LuArrowRight className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}

function ScopeSelect({
  label,
  value,
  onChange,
  countsBySlot,
}: {
  label: string;
  value: ScopePoint;
  onChange: (next: ScopePoint) => void;
  countsBySlot: Map<string, number>;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5">
        <LuLayers className="h-3.5 w-3.5 text-muted" />
        <span className="text-xs font-bold uppercase tracking-wider text-muted">
          {label}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="sr-only">{label} class level</span>
          <select
            value={value.classLevel}
            onChange={(e) =>
              onChange({
                ...value,
                classLevel: e.target.value as ScopePoint["classLevel"],
              })
            }
            className="input"
          >
            {CLASS_LEVELS.map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="sr-only">{label} term</span>
          <select
            value={value.term}
            onChange={(e) =>
              onChange({ ...value, term: e.target.value as ScopePoint["term"] })
            }
            className="input"
          >
            {TERMS.map((term) => {
              const n = countsBySlot.get(`${value.classLevel}:${term}`) ?? 0;
              return (
                <option key={term} value={term}>
                  {TERM_LABELS[term]} ({n})
                </option>
              );
            })}
          </select>
        </label>
      </div>
    </div>
  );
}
