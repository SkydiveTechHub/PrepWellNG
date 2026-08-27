"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { LuSearch, LuTrash2, LuPencil, LuChevronLeft, LuChevronRight, LuCircleAlert } from "react-icons/lu";
import { StatusBanner } from "@/components/admin/status-banner";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { Button, buttonClass } from "@/components/ui/button";
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

interface UsageInfo {
  responseCount: number;
  assessmentCount: number;
  deletable: boolean;
}

interface RefusedRow {
  id: string;
  responseCount: number;
  assessmentCount: number;
}

interface DeleteOutcome {
  tone: "success" | "info";
  title: string;
  message?: string;
}

function plural(n: number, noun: string) {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
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
export function QuestionsClient() {
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
  const [outcome, setOutcome] = useState<DeleteOutcome | null>(null);

  // Bulk selection is per page: changing page or any filter clears it, so a
  // bulk delete can never act on rows the admin can no longer see.
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Single-delete confirmation dialog state.
  const [deleteTarget, setDeleteTarget] = useState<Question | null>(null);
  const [deleteUsage, setDeleteUsage] = useState<UsageInfo | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  // Bulk-delete confirmation dialog state.
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);

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

        const res = await fetch(`/admin/api/questions?${params}`, { signal });
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

  // Selection is scoped to the current page/filter view. Clear it whenever
  // that view changes so a bulk delete can never act on rows the admin can
  // no longer see. Adjusting state during render (rather than in an effect)
  // resets the selection in the SAME render the new page/filter becomes
  // visible, instead of one render later.
  const filterKey = `${page}|${appliedQuery}|${examFilter}|${subjectFilter}|${difficultyFilter}|${examYearFilter}`;
  const [selectionKey, setSelectionKey] = useState(filterKey);
  if (filterKey !== selectionKey) {
    setSelectionKey(filterKey);
    setSelected(new Set());
  }

  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const allOnPageSelected = questions.length > 0 && questions.every((q) => selected.has(q.id));
  const someOnPageSelected = questions.some((q) => selected.has(q.id));

  function toggleSelectAll() {
    setSelected((prev) => {
      if (allOnPageSelected) {
        const next = new Set(prev);
        for (const q of questions) next.delete(q.id);
        return next;
      }
      const next = new Set(prev);
      for (const q of questions) next.add(q.id);
      return next;
    });
  }

  // `indeterminate` is a DOM property, not a JSX attribute, so it has to be
  // assigned imperatively via a ref callback.
  const headerCheckboxRef = useCallback(
    (el: HTMLInputElement | null) => {
      if (el) el.indeterminate = someOnPageSelected && !allOnPageSelected;
    },
    [someOnPageSelected, allOnPageSelected],
  );

  // Opens the single-delete dialog only after the usage check resolves, so
  // the dialog can refuse up front rather than offering a confirm button
  // that would just fail.
  async function openDeleteDialog(q: Question) {
    setDeleteError(null);
    setDeleting(q.id);
    try {
      const res = await fetch(`/admin/api/questions/${q.id}/usage`);
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) {
        setDeleteError("Could not check whether this question can be deleted.");
        return;
      }
      setDeleteUsage(data);
      setDeleteTarget(q);
    } catch {
      setDeleteError("Could not reach the server. The question was not deleted.");
    } finally {
      setDeleting(null);
    }
  }

  function closeDeleteDialog() {
    setDeleteTarget(null);
    setDeleteUsage(null);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    setDeleteError(null);
    // Tracks whether this call actually removed the row from `questions`, so
    // the `finally` cleanup below only touches `selected` on the paths that
    // removed a row (success and notFound) — never on refused/error paths,
    // where the row is still visible and must stay selected.
    let rowRemoved = false;
    try {
      const res = await fetch(`/admin/api/questions?id=${deleteTarget.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setDeleteError(data?.error ?? `Could not delete question (${res.status}).`);
        return;
      }
      // Match by id, not position — with a single id this happened to be
      // safe, but it is a landmine once more than one id is ever in flight.
      const refusedById = new Map<string, RefusedRow>(
        (data?.refused as RefusedRow[] | undefined ?? []).map((r) => [r.id, r]),
      );
      const refused = refusedById.get(deleteTarget.id);
      if (refused) {
        setDeleteError(
          `Can't delete: ${plural(refused.responseCount, "student response")}, ${plural(refused.assessmentCount, "assessment")} depend on this question.`,
        );
        return;
      }
      if ((data?.notFound as string[] | undefined)?.includes(deleteTarget.id)) {
        setQuestions((prev) => prev.filter((item) => item.id !== deleteTarget.id));
        rowRemoved = true;
        setOutcome({
          tone: "info",
          title: "Already gone",
          message: "This question was already deleted.",
        });
        return;
      }
      setQuestions((prev) => prev.filter((item) => item.id !== deleteTarget.id));
      rowRemoved = true;
    } catch {
      setDeleteError("Could not reach the server. The question was not deleted.");
    } finally {
      if (rowRemoved) {
        setSelected((prev) => {
          if (!prev.has(deleteTarget.id)) return prev;
          const next = new Set(prev);
          next.delete(deleteTarget.id);
          return next;
        });
      }
      setDeleteBusy(false);
      closeDeleteDialog();
    }
  }

  async function confirmBulkDelete() {
    setBulkBusy(true);
    setDeleteError(null);
    setOutcome(null);
    try {
      const res = await fetch("/admin/api/questions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...selected] }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) {
        setDeleteError(data?.error ?? `Delete failed (${res.status}).`);
        return;
      }
      const deleted = data.deleted as string[];
      const refused = data.refused as RefusedRow[];
      const notFound = data.notFound as string[];

      // Close the dialog and clear the selection before their counts change,
      // so the dialog never re-renders mid-close with a stale/zeroed count.
      setBulkDialogOpen(false);
      setQuestions((prev) => prev.filter((q) => !deleted.includes(q.id) && !notFound.includes(q.id)));
      setSelected(new Set());

      if (refused.length === 0 && notFound.length === 0) {
        setOutcome({
          tone: "success",
          title: `${plural(deleted.length, "question")} deleted`,
        });
      } else {
        const parts = [`${deleted.length} deleted`];
        if (refused.length > 0) {
          parts.push(`${refused.length} kept because students have already answered them`);
        }
        if (notFound.length > 0) {
          parts.push(`${notFound.length} already gone`);
        }
        setOutcome({
          tone: "info",
          title: "Delete completed",
          message: `${parts.join(", ")}.`,
        });
      }
    } catch {
      setDeleteError("Could not reach the server. No questions were deleted.");
    } finally {
      setBulkBusy(false);
      setBulkDialogOpen(false);
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
        action={
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/questions/import" className={buttonClass("secondary", "md")}>
              Import
            </Link>
            <Link href="/admin/questions/new" className={buttonClass("primary", "md")}>
              New question
            </Link>
          </div>
        }
      />

      {deleteError && (
        <StatusBanner
          tone="error"
          title="Delete failed"
          message={deleteError}
          className="mb-4"
        />
      )}

      {outcome && (
        <StatusBanner
          tone={outcome.tone}
          title={outcome.title}
          message={outcome.message}
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

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center justify-between gap-3 mb-3 rounded-lg border border-border-strong bg-secondary/50 px-4 py-2.5">
          <p role="status" className="text-sm font-medium text-foreground">
            <span className="tabular-nums">{selected.size}</span> selected
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setSelected(new Set())}>
              Clear selection
            </Button>
            <Button variant="danger" size="sm" onClick={() => setBulkDialogOpen(true)}>
              Delete selected
            </Button>
          </div>
        </div>
      )}

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
                    <th scope="col" className={cn(TH_CLS, "px-4 py-3 w-10")}>
                      <input
                        ref={headerCheckboxRef}
                        type="checkbox"
                        checked={allOnPageSelected}
                        onChange={toggleSelectAll}
                        aria-label="Select all questions on this page"
                        className="h-4 w-4 rounded border-border accent-primary"
                      />
                    </th>
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
                    <th scope="col" className={cn(TH_CLS, "text-right px-4 py-3 w-24")}>
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-strong">
                  {questions.map((q) => (
                    <tr key={q.id} className="hover:bg-secondary/30">
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selected.has(q.id)}
                          onChange={() => toggleRow(q.id)}
                          aria-label={`Select question: ${q.questionText.slice(0, 60)}`}
                          className="h-4 w-4 rounded border-border accent-primary"
                        />
                      </td>
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
                        <div className="flex items-center justify-end gap-1">
                          <Link
                            href={`/admin/questions/${q.id}/edit`}
                            aria-label={`Edit question: ${q.questionText.slice(0, 60)}`}
                            className={buttonClass(
                              "ghost",
                              "icon-sm",
                              "text-muted hover:text-foreground",
                            )}
                          >
                            <LuPencil className="w-4 h-4" aria-hidden />
                          </Link>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => openDeleteDialog(q)}
                            disabled={deleting === q.id}
                            aria-label={`Delete question: ${q.questionText.slice(0, 60)}`}
                            className="text-muted hover:text-tone-red-ink hover:bg-tone-red-soft"
                          >
                            <LuTrash2 className="w-4 h-4" aria-hidden />
                          </Button>
                        </div>
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

      {deleteTarget && (
        <ConfirmDialog
          open
          title="Delete question?"
          description={
            deleteUsage && !deleteUsage.deletable
              ? `This question has ${plural(deleteUsage.responseCount, "student response")} and appears in ${plural(deleteUsage.assessmentCount, "assessment")}. It cannot be deleted.`
              : "This cannot be undone."
          }
          confirmLabel="Delete"
          busy={deleteBusy}
          disabled={deleteUsage ? !deleteUsage.deletable : false}
          onConfirm={confirmDelete}
          onCancel={closeDeleteDialog}
        >
          <p className="mt-3 text-sm text-foreground line-clamp-3">{deleteTarget.questionText}</p>
        </ConfirmDialog>
      )}

      {bulkDialogOpen && (
        <ConfirmDialog
          open
          title={`Delete ${plural(selected.size, "question")}?`}
          description="This cannot be undone. Any question with student responses or assessment usage will be kept instead of deleted."
          confirmLabel="Delete"
          busy={bulkBusy}
          onConfirm={confirmBulkDelete}
          onCancel={() => setBulkDialogOpen(false)}
        />
      )}
    </div>
  );
}
