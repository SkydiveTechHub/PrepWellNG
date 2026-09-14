"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AdminTable, AdminTd, AdminTh, AdminTr } from "@/components/admin/admin-table";
import { StatusBanner } from "@/components/admin/status-banner";
import { buttonClass } from "@/components/ui/button";
import { TERM_LABELS, type Term } from "@/lib/curriculum-scope";
import type { AcademicTermRow } from "@/lib/academic-terms";

type Draft = { id?: string; session: string; term: Term; startsOn: string; endsOn: string };

const EMPTY: Draft = { session: "", term: "FIRST", startsOn: "", endsOn: "" };

export function AcademicTermManager({ terms }: { terms: AcademicTermRow[] }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  async function send(url: string, method: string, body?: unknown) {
    setError("");
    const res = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Could not save the term.");
      return false;
    }
    startTransition(() => router.refresh());
    return true;
  }

  async function save() {
    const { id, ...body } = draft;
    const ok = await send(
      id ? `/admin/api/academic-terms/${id}` : "/admin/api/academic-terms",
      id ? "PATCH" : "POST",
      body,
    );
    if (ok) setDraft(EMPTY);
  }

  return (
    <div className="space-y-6">
      {error && <StatusBanner tone="error" title={error} />}

      <AdminTable caption="Configured academic terms">
        <thead>
          <tr>
            <AdminTh>Session</AdminTh>
            <AdminTh>Term</AdminTh>
            <AdminTh>Starts</AdminTh>
            <AdminTh>Ends</AdminTh>
            <AdminTh>
              <span className="sr-only">Actions</span>
            </AdminTh>
          </tr>
        </thead>
        <tbody>
          {terms.map((t) => (
            <AdminTr key={t.id}>
              <AdminTd>{t.session}</AdminTd>
              <AdminTd>{TERM_LABELS[t.term]}</AdminTd>
              <AdminTd>{t.startsOn}</AdminTd>
              <AdminTd>{t.endsOn}</AdminTd>
              <AdminTd className="text-right">
                <button type="button" className={buttonClass("ghost", "sm")} onClick={() => setDraft({ ...t })}>
                  Edit
                </button>
                <button
                  type="button"
                  className={buttonClass("ghost", "sm")}
                  onClick={() => send(`/admin/api/academic-terms/${t.id}`, "DELETE")}
                >
                  Delete
                </button>
              </AdminTd>
            </AdminTr>
          ))}
        </tbody>
      </AdminTable>

      <form
        className="card grid grid-cols-1 gap-4 p-5 sm:grid-cols-5"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <label className="text-sm">
          <span className="label">Session</span>
          <input className="input" placeholder="2026/2027" value={draft.session}
            onChange={(e) => setDraft({ ...draft, session: e.target.value })} required />
        </label>
        <label className="text-sm">
          <span className="label">Term</span>
          <select className="input" value={draft.term}
            onChange={(e) => setDraft({ ...draft, term: e.target.value as Term })}>
            {(["FIRST", "SECOND", "THIRD"] as const).map((term) => (
              <option key={term} value={term}>{TERM_LABELS[term]}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="label">First day</span>
          <input className="input" type="date" value={draft.startsOn}
            onChange={(e) => setDraft({ ...draft, startsOn: e.target.value })} required />
        </label>
        <label className="text-sm">
          <span className="label">Last day</span>
          <input className="input" type="date" value={draft.endsOn}
            onChange={(e) => setDraft({ ...draft, endsOn: e.target.value })} required />
        </label>
        <div className="flex items-end gap-2">
          <button type="submit" disabled={pending} className={buttonClass("primary", "md")}>
            {draft.id ? "Save changes" : "Add term"}
          </button>
          {draft.id && (
            <button type="button" className={buttonClass("ghost", "md")} onClick={() => setDraft(EMPTY)}>
              Cancel
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
