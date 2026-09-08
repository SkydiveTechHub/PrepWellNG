"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  LuCheck,
  LuPencil,
  LuChevronRight,
  LuInbox,
  LuDownload,
} from "react-icons/lu";
import { isRelevantSubject, relevantTrackCategories } from "@/lib/subjects";
import { examYearRange } from "@/lib/exam-years";
import { TRACK_CATEGORIES } from "@/lib/subjects";
import { assessBoards } from "@/lib/board-availability";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import { Spinner } from "@/components/ui/spinner";

type PastPaper = {
  examType: string;
  examYear: number;
  subjectId: string;
  subjectName: string;
  subjectSlug: string;
  trackCategory: string;
  /** Null for a paper the provider lists but we have never pulled. */
  questionCount: number | null;
  cached: boolean;
};

const EXAM_BADGES: Record<string, "blue" | "green" | "purple"> = {
  WAEC: "blue",
  JAMB: "green",
  NECO: "purple",
};

export function PastQuestionPicker({ track }: { track: string | null }) {
  const [papers, setPapers] = useState<PastPaper[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const [exam, setExam] = useState<string | null>(null);
  const [subjectId, setSubjectId] = useState<string | null>(null);
  const [showAllSubjects, setShowAllSubjects] = useState(false);

  useEffect(() => {
    // One fetch for the whole picker — the paper list is small (one row per
    // exam/subject/year), so every step filters in memory instead of re-querying.
    fetch("/api/questions/past-papers")
      .then((r) => r.json())
      .then((data) => setPapers(data.papers ?? []))
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  }, []);

  // ① Exams that actually have papers.
  const exams = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of papers) {
      counts.set(p.examType, (counts.get(p.examType) ?? 0) + (p.questionCount ?? 0));
    }
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [papers]);

  // Which of those exams are open, decided from the papers themselves rather
  // than a hard-coded list. The unit is papers per subject, not questions: a
  // paper we have never pulled is fetched on the way into the quiz, so it
  // counts as coverage the moment the provider lists it.
  const boardStatus = useMemo(() => {
    const perBoard = new Map<string, Map<string, number>>();
    for (const p of papers) {
      const subjects = perBoard.get(p.examType) ?? new Map<string, number>();
      subjects.set(p.subjectId, (subjects.get(p.subjectId) ?? 0) + 1);
      perBoard.set(p.examType, subjects);
    }
    return assessBoards(
      "PAST_QUESTIONS",
      Object.fromEntries(
        [...perBoard.entries()].map(([board, subjects]) => [
          board,
          [...subjects.values()],
        ]),
      ),
    );
  }, [papers]);

  // ② Subjects available for the chosen exam.
  const subjects = useMemo(() => {
    if (!exam) return [];

    const byId = new Map<string, PastPaper & { questionCount: number; years: number }>();
    for (const p of papers) {
      if (p.examType !== exam) continue;
      const found = byId.get(p.subjectId);
      if (found) {
        // An uncached paper adds no questions but is still a year on offer.
        found.questionCount += p.questionCount ?? 0;
        found.years += 1;
      } else {
        byId.set(p.subjectId, { ...p, questionCount: p.questionCount ?? 0, years: 1 });
      }
    }
    return [...byId.values()].sort((a, b) => a.subjectName.localeCompare(b.subjectName));
  }, [papers, exam]);

  const relevantSubjects = useMemo(
    () => subjects.filter((s) => isRelevantSubject(s.trackCategory, track)),
    [subjects, track],
  );

  // Only offer the toggle when narrowing actually hides something.
  const narrows =
    relevantTrackCategories(track).length < TRACK_CATEGORIES.length &&
    relevantSubjects.length < subjects.length;
  const visibleSubjects = showAllSubjects || !narrows ? subjects : relevantSubjects;

  // ③ Years for the chosen exam + subject.
  //
  // Every year in the modern record is offered, not just the ones we hold. A
  // paper we have never pulled is fetched from the provider on the way into
  // the quiz, so listing only what is cached kept those papers permanently out
  // of reach — nobody could select them, so nobody ever fetched them. Held
  // years are annotated, not filtered.
  const years = useMemo(() => {
    if (!exam || !subjectId) return [];

    const held = new Map<number, PastPaper>();
    for (const p of papers) {
      if (p.examType === exam && p.subjectId === subjectId) held.set(p.examYear, p);
    }
    return examYearRange([...held.keys()]).map((year) => ({
      year,
      paper: held.get(year) ?? null,
    }));
  }, [papers, exam, subjectId]);

  const readyYears = useMemo(
    () => years.filter((y) => y.paper?.cached),
    [years],
  );

  const chosenSubject = subjects.find((s) => s.subjectId === subjectId);

  // Built from the chosen subject rather than a paper row: most years on offer
  // have no row to read a slug off.
  const yearHref = (year: number) =>
    `/practice/past-questions/${chosenSubject?.subjectSlug}?exam=${exam}&year=${year}`;

  if (loading) {
    return <Spinner label="Loading past papers..." />;
  }

  if (failed || papers.length === 0) {
    return (
      <EmptyState
        tone="primary"
        icon={<LuInbox className="h-6 w-6" />}
        title={failed ? "Couldn't load past papers" : "No past papers yet"}
        description={
          failed
            ? "Please refresh the page to try again."
            : "Past questions will appear here once they're imported."
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* ① Exam */}
      {exam ? (
        <SummaryChip
          step={1}
          label="Exam"
          value={exam}
          onEdit={() => {
            setExam(null);
            setSubjectId(null);
          }}
        />
      ) : (
        <Step number={1} title="Choose an exam">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {exams.map(([type, questionCount]) => {
              // A board too thin to be worth entering is still listed — a
              // student should be able to see it is on the way — but it names
              // what it is waiting for instead of an open-ended "coming soon",
              // and it opens itself the moment the bank clears the bar.
              const status = boardStatus[type];
              const comingSoon = !status?.ready;
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => setExam(type)}
                  disabled={comingSoon}
                  className={cn(
                    "card p-4 text-left",
                    comingSoon
                      ? "cursor-not-allowed opacity-60"
                      : "card-interactive",
                  )}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={EXAM_BADGES[type] ?? "neutral"}>{type}</Badge>
                    {comingSoon && <Badge>Not ready yet</Badge>}
                  </div>
                  <p className="mt-2 text-sm text-muted">
                    {comingSoon
                      ? status?.reason ?? "Not open for practice yet"
                      : `${questionCount} question${questionCount === 1 ? "" : "s"}`}
                  </p>
                </button>
              );
            })}
          </div>
        </Step>
      )}

      {/* ② Subject */}
      {exam &&
        (subjectId && chosenSubject ? (
          <SummaryChip
            step={2}
            label="Subject"
            value={chosenSubject.subjectName}
            onEdit={() => setSubjectId(null)}
          />
        ) : (
          <Step
            number={2}
            title="Choose a subject"
            action={
              narrows ? (
                <button
                  type="button"
                  onClick={() => setShowAllSubjects((v) => !v)}
                  className="text-sm font-semibold text-primary hover:underline"
                >
                  {showAllSubjects ? "Show my subjects" : "Show all subjects"}
                </button>
              ) : undefined
            }
          >
            {visibleSubjects.length === 0 ? (
              <p className="text-sm text-muted">
                No {exam} papers for your subjects yet.
                {narrows && " Try showing all subjects."}
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {visibleSubjects.map((s) => (
                  <button
                    key={s.subjectId}
                    type="button"
                    onClick={() => setSubjectId(s.subjectId)}
                    className="card card-interactive p-4 text-left"
                  >
                    <p className="text-sm font-semibold text-foreground">{s.subjectName}</p>
                    <p className="mt-1 text-xs text-muted">
                      {s.questionCount} questions &middot; {s.years} year
                      {s.years === 1 ? "" : "s"} loaded
                    </p>
                  </button>
                ))}
              </div>
            )}
          </Step>
        ))}

      {/* ③ Year */}
      {exam && subjectId && (
        <Step number={3} title="Choose a year">
          <>
            {/* Papers already in the bank start instantly, so they lead. */}
            {readyYears.length > 0 && (
              <div className="mb-5">
                <p className="section-label mb-2.5">Ready to start</p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {readyYears.map(({ year, paper }) => (
                    <Link
                      key={year}
                      href={yearHref(year)}
                      className="card card-interactive group flex items-center justify-between gap-3 border-success/30 p-4"
                    >
                      <div>
                        <p className="text-base font-bold text-foreground">{year}</p>
                        <p className="mt-0.5 text-xs text-success">
                          {paper?.questionCount} questions ready
                        </p>
                      </div>
                      <LuChevronRight className="h-4 w-4 text-muted transition-all group-hover:translate-x-0.5 group-hover:text-primary" />
                    </Link>
                  ))}
                </div>
              </div>
            )}

            <p className="section-label mb-2.5">
              {readyYears.length > 0 ? "Every year" : "Pick any year"}
            </p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-6">
              {years.map(({ year, paper }) => (
                <Link
                  key={year}
                  href={yearHref(year)}
                  className={cn(
                    "rounded-xl border px-3 py-2.5 text-center text-sm font-bold transition-all",
                    paper?.cached
                      ? "border-success/40 bg-success-soft text-success"
                      : "border-border bg-card text-foreground hover:border-primary/40 hover:text-primary",
                  )}
                >
                  {year}
                </Link>
              ))}
            </div>
            <p className="mt-3 flex items-start gap-1.5 text-xs text-muted">
              <LuDownload className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
              Years without a tick are pulled from the question bank when you
              start them — it takes a moment longer the first time.
            </p>
          </>
        </Step>
      )}
    </div>
  );
}

function Step({
  number,
  title,
  action,
  children,
}: {
  number: number;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="card animate-slide-up p-5 sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2.5 text-sm font-bold text-foreground">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
            {number}
          </span>
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function SummaryChip({
  step,
  label,
  value,
  onEdit,
}: {
  step: number;
  label: string;
  value: string;
  onEdit: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onEdit}
      className="group flex w-full items-center gap-3 rounded-xl border border-border bg-card px-5 py-3.5 text-left shadow-soft transition-all hover:border-primary/30 hover:shadow-card"
    >
      <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-success-soft text-success">
        <LuCheck className="h-4 w-4" />
      </span>
      <span className="text-xs font-bold uppercase tracking-wider text-muted">{label}</span>
      <span className="flex-1 truncate font-semibold text-foreground">{value}</span>
      <span className="flex items-center gap-1.5 text-xs font-semibold text-muted transition-colors group-hover:text-primary">
        <LuPencil className="h-3.5 w-3.5" />
        Change
      </span>
      <span className="sr-only">Change step {step}</span>
    </button>
  );
}
