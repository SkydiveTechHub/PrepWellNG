"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { LuSearch, LuTrash2, LuChevronLeft, LuChevronRight, LuCircleAlert } from "react-icons/lu";
import { StatusBanner } from "@/components/admin/status-banner";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { cn } from "@/lib/utils";

interface Question {
  id: string;
  questionText: string;
  examType: string;
  examYear: number | null;
  difficulty: string;
  subject: { name: string; code: string };
  topic: { title: string; slug: string } | null;
}

interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

interface SubjectOption {
  id: string;
  name: string;
  code: string;
}

const TH_CLS = "text-[11px] font-semibold uppercase tracking-wider text-muted";

// `useSearchParams` requires a Suspense boundary around the Client Component
// that calls it, or a static build fails ("Missing Suspense boundary with
// useSearchParams"). See node_modules/next/dist/docs/01-app/03-api-reference/
// 04-functions/use-search-params.md.
export default function AdminQuestionsPage() {
  return (
    <Suspense fallback={<QuestionsPageFallback />}>
      <AdminQuestionsPageInner />
    </Suspense>
  );
}

function QuestionsPageFallback() {
  return (
    <div>
      <PageHeader title="Questions" description="Loading…" />
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    </div>
  );
}

function AdminQuestionsPageInner() {
  const searchParams = useSearchParams();

  const [questions, setQuestions] = useState<Question[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Input state (what the user is typing) vs applied state (what the request
  // actually uses). Splitting these is what stops a refetch firing on every
  // keystroke.
  const [queryInput, setQueryInput] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");

  const [examFilter, setExamFilter] = useState(() => searchParams.get("examType") ?? "");
  const [subjectFilter, setSubjectFilter] = useState(() => searchParams.get("subjectId") ?? "");
  const [difficultyFilter, setDifficultyFilter] = useState(() => searchParams.get("difficulty") ?? "");
  const [examYearFilter, setExamYearFilter] = useState(() => searchParams.get("examYear") ?? "");

  const [page, setPage] = useState(1);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [subjects, setSubjects] = useState<SubjectOption[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/subjects")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.subjects) {
          setSubjects(
            (data.subjects as SubjectOption[])
              .map((s) => ({ id: s.id, name: s.name, code: s.code }))
              .sort((a, b) => a.name.localeCompare(b.name)),
          );
        }
      })
      .catch(() => {
        // Subject options are a progressive enhancement of the filters; a
        // failure here shouldn't block the question list itself.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const fetchQuestions = useCallback(
    async (signal: AbortSignal) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ page: String(page), pageSize: "20" });
        if (appliedQuery) params.set("search", appliedQuery);
        if (examFilter) params.set("examType", examFilter);
        if (subjectFilter) params.set("subjectId", subjectFilter);
        if (difficultyFilter) params.set("difficulty", difficultyFilter);
        if (examYearFilter) params.set("examYear", examYearFilter);

        const res = await fetch(`/api/admin/questions?${params}`, { signal });
        const data = await res.json();
        if (!res.ok) {
          // Previously this fell through to the empty state, so a 500 was
          // indistinguishable from an empty database.
          setError(data.error ?? `Request failed (${res.status}).`);
          return;
        }
        setQuestions(data.questions);
        setPagination(data.pagination);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setError("Could not reach the server. Check your connection and retry.");
      } finally {
        setLoading(false);
      }
    },
    [page, appliedQuery, examFilter, subjectFilter, difficultyFilter, examYearFilter],
  );

  useEffect(() => {
    // This effect intentionally triggers data loading on mount and whenever the
    // filter/page inputs (or reloadKey, for Retry) change; fetchQuestions is
    // memoized over those inputs.
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchQuestions(controller.signal);
    return () => controller.abort();
  }, [fetchQuestions, reloadKey]);

  async function handleDelete(q: Question) {
    if (!confirm("Delete this question? This cannot be undone.")) return;
    setDeleting(q.id);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/admin/questions?id=${q.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setDeleteError(data?.error ?? `Could not delete question (${res.status}).`);
        return;
      }
      const refused = data?.refused?.[0];
      if (refused) {
        setDeleteError(
          `Can't delete: ${refused.responseCount} student response(s), ${refused.assessmentCount} assessment(s) depend on this question.`,
        );
        return;
      }
      if (data?.notFound?.includes(q.id)) {
        setDeleteError("This question was already deleted (not found).");
        setQuestions((prev) => prev.filter((item) => item.id !== q.id));
        return;
      }
      setQuestions((prev) => prev.filter((item) => item.id !== q.id));
    } catch {
      setDeleteError("Could not reach the server. The question was not deleted.");
    } finally {
      setDeleting(null);
    }
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setAppliedQuery(queryInput);
    setPage(1);
  }

  function handleClear() {
    setQueryInput("");
    setAppliedQuery("");
    setExamFilter("");
    setSubjectFilter("");
    setDifficultyFilter("");
    setExamYearFilter("");
    setPage(1);
  }

  const hasFilters =
    appliedQuery || examFilter || subjectFilter || difficultyFilter || examYearFilter;

  return (
    <div>
      <PageHeader
        title="Questions"
        description={pagination ? `${pagination.total} total` : "Loading…"}
      />

      {deleteError && (
        <StatusBanner
          tone="error"
          title="Delete failed"
          message={deleteError}
          className="mb-4"
        />
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 mb-6">
        <form onSubmit={handleSearch} className="flex-1 min-w-[200px] max-w-sm">
          <label htmlFor="question-search" className="sr-only">
            Search questions
          </label>
          <div className="relative">
            <LuSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" aria-hidden />
            <input
              id="question-search"
              type="text"
              value={queryInput}
              onChange={(e) => setQueryInput(e.target.value)}
              placeholder="Search questions..."
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-border bg-card text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus:border-primary"
            />
          </div>
        </form>

        <div className="flex flex-col gap-1">
          <label htmlFor="exam-filter" className="text-[11px] font-semibold uppercase tracking-wider text-muted">
            Exam
          </label>
          <select
            id="exam-filter"
            value={examFilter}
            onChange={(e) => {
              setExamFilter(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 rounded-lg border border-border bg-card text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          >
            <option value="">All exams</option>
            <option value="WAEC">WAEC</option>
            <option value="JAMB">JAMB</option>
            <option value="NECO">NECO</option>
            <option value="CUSTOM">Custom</option>
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="subject-filter" className="text-[11px] font-semibold uppercase tracking-wider text-muted">
            Subject
          </label>
          <select
            id="subject-filter"
            value={subjectFilter}
            onChange={(e) => {
              setSubjectFilter(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 rounded-lg border border-border bg-card text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          >
            <option value="">All subjects</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="difficulty-filter" className="text-[11px] font-semibold uppercase tracking-wider text-muted">
            Difficulty
          </label>
          <select
            id="difficulty-filter"
            value={difficultyFilter}
            onChange={(e) => {
              setDifficultyFilter(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 rounded-lg border border-border bg-card text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          >
            <option value="">All difficulties</option>
            <option value="BASIC">Basic</option>
            <option value="INTERMEDIATE">Intermediate</option>
            <option value="ADVANCED">Advanced</option>
          </select>
        </div>

        {hasFilters ? (
          <Button variant="outline" size="md" onClick={handleClear}>
            Clear
          </Button>
        ) : null}
      </div>

      {/* Results region */}
      <div role="region" aria-label="Questions" aria-busy={loading}>
        <p role="status" className="sr-only">
          {loading
            ? "Loading questions"
            : `Showing ${questions.length} of ${pagination?.total ?? 0} questions`}
        </p>

        {error ? (
          <StatusBanner
            tone="error"
            title="Could not load questions"
            message={error}
            action={
              <Button variant="outline" size="sm" onClick={() => setReloadKey((k) => k + 1)}>
                Retry
              </Button>
            }
          />
        ) : loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : questions.length === 0 ? (
          <div className="bg-card border border-border rounded-lg p-12 text-center">
            <LuCircleAlert className="w-10 h-10 text-muted mx-auto mb-3" aria-hidden />
            <p className="text-muted">No questions found.</p>
          </div>
        ) : (
          <div className="bg-card border border-border-strong rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">
                  Questions, page {pagination?.page ?? 1} of {pagination?.totalPages ?? 1}
                </caption>
                <thead>
                  <tr className="border-b border-border-strong bg-secondary/50">
                    <th scope="col" className={cn(TH_CLS, "text-left px-4 py-3")}>
                      Question
                    </th>
                    <th scope="col" className={cn(TH_CLS, "text-left px-4 py-3 w-20")}>
                      Subject
                    </th>
                    <th scope="col" className={cn(TH_CLS, "text-left px-4 py-3 w-20")}>
                      Exam
                    </th>
                    <th scope="col" className={cn(TH_CLS, "text-left px-4 py-3 w-20")}>
                      Year
                    </th>
                    <th scope="col" className={cn(TH_CLS, "text-left px-4 py-3 w-20")}>
                      Difficulty
                    </th>
                    <th scope="col" className={cn(TH_CLS, "text-right px-4 py-3 w-16")}>
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-strong">
                  {questions.map((q) => (
                    <tr key={q.id} className="hover:bg-secondary/30">
                      <td className="px-4 py-3">
                        <p className="text-foreground truncate max-w-md">{q.questionText}</p>
                        {q.topic && <p className="text-xs text-muted mt-0.5">{q.topic.title}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs font-medium px-2 py-0.5 rounded bg-primary/10 text-primary">
                          {q.subject.code}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-foreground">{q.examType}</td>
                      <td className="px-4 py-3 text-foreground tabular-nums">{q.examYear || "—"}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-xs font-medium px-2 py-0.5 rounded ${
                            q.difficulty === "BASIC"
                              ? "bg-tone-green-soft text-tone-green-ink"
                              : q.difficulty === "INTERMEDIATE"
                                ? "bg-tone-amber-soft text-tone-amber-ink"
                                : "bg-tone-red-soft text-tone-red-ink"
                          }`}
                        >
                          {q.difficulty}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => handleDelete(q)}
                          disabled={deleting === q.id}
                          aria-label={`Delete question: ${q.questionText.slice(0, 60)}`}
                          className="text-muted hover:text-tone-red-ink hover:bg-tone-red-soft"
                        >
                          <LuTrash2 className="w-4 h-4" aria-hidden />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <nav aria-label="Pagination" className="flex items-center justify-between mt-4">
          <p className="text-sm text-muted">
            Page <span className="tabular-nums">{pagination.page}</span> of{" "}
            <span className="tabular-nums">{pagination.totalPages}</span>
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              aria-label="Previous page"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={pagination.page <= 1}
            >
              <LuChevronLeft className="w-4 h-4" aria-hidden />
            </Button>
            <Button
              variant="outline"
              size="icon"
              aria-label="Next page"
              onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
              disabled={pagination.page >= pagination.totalPages}
            >
              <LuChevronRight className="w-4 h-4" aria-hidden />
            </Button>
          </div>
        </nav>
      )}
    </div>
  );
}
