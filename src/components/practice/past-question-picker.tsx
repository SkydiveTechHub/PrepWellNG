"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { LuCheck, LuPencil, LuChevronRight, LuInbox } from "react-icons/lu";
import { isRelevantSubject, relevantTrackCategories } from "@/lib/subjects";
import { TRACK_CATEGORIES } from "@/lib/subjects";
import { isComingSoonBoard } from "@/lib/constants/exam-types";
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
  questionCount: number;
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
      counts.set(p.examType, (counts.get(p.examType) ?? 0) + p.questionCount);
    }
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [papers]);

  // ② Subjects available for the chosen exam.
  const subjects = useMemo(() => {
    if (!exam) return [];

    const byId = new Map<string, PastPaper & { questionCount: number; years: number }>();
    for (const p of papers) {
      if (p.examType !== exam) continue;
      const found = byId.get(p.subjectId);
      if (found) {
        found.questionCount += p.questionCount;
        found.years += 1;
      } else {
        byId.set(p.subjectId, { ...p, years: 1 });
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
  const years = useMemo(() => {
    if (!exam || !subjectId) return [];
    return papers
      .filter((p) => p.examType === exam && p.subjectId === subjectId)
      .sort((a, b) => b.examYear - a.examYear);
  }, [papers, exam, subjectId]);

  const chosenSubject = subjects.find((s) => s.subjectId === subjectId);

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
              // Papers may already be imported for a board we aren't opening
              // up yet — list it so students can see it's on the way, but
              // don't let them walk into it.
              const comingSoon = isComingSoonBoard(type);
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
                    {comingSoon && <Badge>Coming soon</Badge>}
                  </div>
                  <p className="mt-2 text-sm text-muted">
                    {comingSoon
                      ? "Not open for practice yet"
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
                      {s.years === 1 ? "" : "s"}
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
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {years.map((paper) => (
              <Link
                key={`${paper.examType}-${paper.examYear}`}
                href={`/practice/past-questions/${paper.subjectSlug}?exam=${paper.examType}&year=${paper.examYear}`}
                className="card card-interactive group flex items-center justify-between gap-3 p-4"
              >
                <div>
                  <p className="text-base font-bold text-foreground">{paper.examYear}</p>
                  <p className="mt-0.5 text-xs text-muted">{paper.questionCount} questions</p>
                </div>
                <LuChevronRight className="h-4 w-4 text-muted transition-all group-hover:translate-x-0.5 group-hover:text-primary" />
              </Link>
            ))}
          </div>
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
