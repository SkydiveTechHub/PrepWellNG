"use client";

import { useEffect, useState, useCallback } from "react";
import { LuSearch, LuTrash2, LuChevronLeft, LuChevronRight, LuCircleAlert } from "react-icons/lu";

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

export default function AdminQuestionsPage() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [examFilter, setExamFilter] = useState("");
  const [page, setPage] = useState(1);
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchQuestions = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: page.toString(), pageSize: "20" });
      if (search) params.set("search", search);
      if (examFilter) params.set("examType", examFilter);

      const res = await fetch(`/api/admin/questions?${params}`);
      const data = await res.json();
      if (res.ok) {
        setQuestions(data.questions);
        setPagination(data.pagination);
      }
    } finally {
      setLoading(false);
    }
  }, [page, search, examFilter]);

  useEffect(() => {
    // This effect intentionally triggers data loading on mount and whenever the
    // filter/page inputs change; fetchQuestions is memoized over those inputs.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchQuestions();
  }, [fetchQuestions]);

  async function handleDelete(id: string) {
    if (!confirm("Delete this question? This cannot be undone.")) return;
    setDeleting(id);
    try {
      const res = await fetch(`/api/admin/questions?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        setQuestions((prev) => prev.filter((q) => q.id !== id));
      }
    } finally {
      setDeleting(null);
    }
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Questions</h1>
          <p className="text-sm text-muted mt-0.5">
            {pagination ? `${pagination.total} total` : "Loading..."}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <form onSubmit={handleSearch} className="flex-1 min-w-[200px] max-w-sm">
          <div className="relative">
            <LuSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search questions..."
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>
        </form>
        <select
          value={examFilter}
          onChange={(e) => { setExamFilter(e.target.value); setPage(1); }}
          className="px-3 py-2 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
        >
          <option value="">All exams</option>
          <option value="WAEC">WAEC</option>
          <option value="JAMB">JAMB</option>
          <option value="NECO">NECO</option>
        </select>
        <button
          onClick={() => { setSearch(""); setExamFilter(""); setPage(1); }}
          className="px-3 py-2 rounded-lg border border-border text-sm text-muted hover:bg-secondary transition-colors"
        >
          Clear
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : questions.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <LuCircleAlert className="w-10 h-10 text-muted mx-auto mb-3" />
          <p className="text-muted">No questions found.</p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <th className="text-left px-4 py-3 font-medium text-muted">Question</th>
                  <th className="text-left px-4 py-3 font-medium text-muted w-20">Subject</th>
                  <th className="text-left px-4 py-3 font-medium text-muted w-20">Exam</th>
                  <th className="text-left px-4 py-3 font-medium text-muted w-20">Year</th>
                  <th className="text-left px-4 py-3 font-medium text-muted w-20">Difficulty</th>
                  <th className="text-right px-4 py-3 font-medium text-muted w-16">Action</th>
                </tr>
              </thead>
              <tbody>
                {questions.map((q) => (
                  <tr key={q.id} className="border-b border-border last:border-0 hover:bg-secondary/30">
                    <td className="px-4 py-3">
                      <p className="text-foreground truncate max-w-md">
                        {q.questionText}
                      </p>
                      {q.topic && (
                        <p className="text-xs text-muted mt-0.5">{q.topic.title}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-medium px-2 py-0.5 rounded bg-primary/10 text-primary">
                        {q.subject.code}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-foreground">{q.examType}</td>
                    <td className="px-4 py-3 text-foreground">{q.examYear || "\u2014"}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs font-medium px-2 py-0.5 rounded ${
                          q.difficulty === "BASIC"
                            ? "bg-green-100 text-green-700"
                            : q.difficulty === "INTERMEDIATE"
                              ? "bg-amber-100 text-amber-700"
                              : "bg-red-100 text-red-700"
                        }`}
                      >
                        {q.difficulty}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleDelete(q.id)}
                        disabled={deleting === q.id}
                        className="p-1.5 rounded-lg text-muted hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                        title="Delete"
                      >
                        <LuTrash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-muted">
            Page {pagination.page} of {pagination.totalPages}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={pagination.page <= 1}
              className="p-2 rounded-lg border border-border disabled:opacity-30 hover:bg-secondary transition-colors"
            >
              <LuChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
              disabled={pagination.page >= pagination.totalPages}
              className="p-2 rounded-lg border border-border disabled:opacity-30 hover:bg-secondary transition-colors"
            >
              <LuChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
