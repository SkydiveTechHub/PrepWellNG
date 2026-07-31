"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { LuCheck, LuPencil, LuBookOpen, LuChevronRight } from "react-icons/lu";
import { cn } from "@/lib/utils";
import { isRelevantSubject, relevantTrackCategories } from "@/lib/subjects";
import { TRACK_CATEGORIES } from "@/lib/subjects";

type PastPaper = {
  examType: string;
  examYear: number;
  subjectId: string;
  subjectName: string;
  subjectSlug: string;
  trackCategory: string;
  questionCount: number;
};

const EXAM_STYLES: Record<string, string> = {
  WAEC: "bg-blue-100 text-blue-700",
  JAMB: "bg-green-100 text-green-700",
  NECO: "bg-purple-100 text-purple-700",
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
    return (
      <div className="text-center py-12">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm text-muted">Loading past papers...</p>
      </div>
    );
  }

  if (failed || papers.length === 0) {
    return (
      <div className="text-center py-12 bg-card border border-border rounded-lg">
        <LuBookOpen className="w-12 h-12 text-muted mx-auto mb-3" />
        <h3 className="font-semibold text-foreground">
          {failed ? "Couldn't load past papers" : "No past papers yet"}
        </h3>
        <p className="text-sm text-muted mt-1">
          {failed
            ? "Please refresh the page to try again."
            : "Past questions will appear here once they're imported."}
        </p>
      </div>
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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {exams.map(([type, questionCount]) => (
              <button
                key={type}
                type="button"
                onClick={() => setExam(type)}
                className="p-4 rounded-lg border border-border bg-card text-left hover:border-primary/40 hover:bg-primary/5 transition-all"
              >
                <span
                  className={cn(
                    "text-xs font-medium px-2 py-0.5 rounded-full",
                    EXAM_STYLES[type] ?? "bg-secondary text-foreground",
                  )}
                >
                  {type}
                </span>
                <p className="text-sm text-muted mt-2">
                  {questionCount} question{questionCount === 1 ? "" : "s"}
                </p>
              </button>
            ))}
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
                  className="text-sm font-medium text-primary hover:underline"
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
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {visibleSubjects.map((s) => (
                  <button
                    key={s.subjectId}
                    type="button"
                    onClick={() => setSubjectId(s.subjectId)}
                    className="p-4 rounded-lg border border-border bg-card text-left hover:border-primary/40 hover:bg-primary/5 transition-all"
                  >
                    <p className="font-medium text-foreground text-sm">
                      {s.subjectName}
                    </p>
                    <p className="text-xs text-muted mt-1">
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {years.map((paper) => (
              <Link
                key={`${paper.examType}-${paper.examYear}`}
                href={`/practice/past-questions/${paper.subjectSlug}?exam=${paper.examType}&year=${paper.examYear}`}
                className="flex items-center justify-between p-4 rounded-lg border border-border bg-card hover:border-primary/30 hover:bg-primary/5 transition-all group"
              >
                <div>
                  <p className="font-semibold text-foreground">
                    {paper.examYear}
                  </p>
                  <p className="text-xs text-muted mt-1">
                    {paper.questionCount} questions
                  </p>
                </div>
                <LuChevronRight className="w-4 h-4 text-muted group-hover:text-primary transition-colors" />
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
    <section className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="flex items-center gap-2.5 text-sm font-semibold text-foreground">
          <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center">
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
      className="w-full flex items-center gap-3 px-5 py-3 rounded-xl border border-border bg-card hover:border-primary/30 transition-colors text-left group"
    >
      <span className="w-6 h-6 rounded-full bg-success/10 text-success flex items-center justify-center flex-shrink-0">
        <LuCheck className="w-3.5 h-3.5" />
      </span>
      <span className="text-xs text-muted uppercase tracking-wider">
        {label}
      </span>
      <span className="font-medium text-foreground flex-1">{value}</span>
      <span className="flex items-center gap-1.5 text-xs text-muted group-hover:text-primary transition-colors">
        <LuPencil className="w-3.5 h-3.5" />
        Change
      </span>
      <span className="sr-only">Change step {step}</span>
    </button>
  );
}
