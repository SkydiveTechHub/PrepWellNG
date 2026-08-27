"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CLASS_LEVELS } from "@/lib/curriculum-scope";
import { SUBSCRIPTION_TIERS, TIER_LABELS } from "@/lib/subscription";
import { ACCOUNT_STATUSES } from "@/lib/account-status";
import { TRACKS, type StudentFilter } from "@/lib/admin-student";

const SELECT_CLS =
  "px-3 py-2 rounded-lg border border-border bg-card text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60";
const LABEL_CLS = "text-[11px] font-semibold uppercase tracking-wider text-muted";

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  suspended: "Suspended",
};

export function StudentFilterBar({ filter }: { filter: StudentFilter }) {
  const router = useRouter();
  const [search, setSearch] = useState(filter.search ?? "");

  // Any change resets to page 1: staying on page 7 of a narrower result set
  // shows an empty table.
  function go(next: Partial<Record<"q" | "class" | "track" | "tier" | "status", string>>) {
    const params = new URLSearchParams({
      ...(filter.search ? { q: filter.search } : {}),
      ...(filter.classLevel ? { class: filter.classLevel } : {}),
      ...(filter.track ? { track: filter.track } : {}),
      ...(filter.tier ? { tier: filter.tier } : {}),
      ...(filter.status ? { status: filter.status } : {}),
    });
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    const query = params.toString();
    router.replace(query ? `/admin/students?${query}` : "/admin/students");
  }

  // Debounced so typing a name is not one navigation per keystroke.
  useEffect(() => {
    const current = filter.search ?? "";
    if (search === current) return;
    const id = setTimeout(() => go({ q: search }), 350);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  return (
    <div className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-border-strong bg-card p-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="student-search" className={LABEL_CLS}>
          Search
        </label>
        <input
          id="student-search"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Name, email or phone"
          className={SELECT_CLS}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="student-class" className={LABEL_CLS}>
          Class
        </label>
        <select
          id="student-class"
          value={filter.classLevel ?? ""}
          onChange={(e) => go({ class: e.target.value })}
          className={SELECT_CLS}
        >
          <option value="">All classes</option>
          {CLASS_LEVELS.map((level) => (
            <option key={level} value={level}>
              {level}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="student-track" className={LABEL_CLS}>
          Track
        </label>
        <select
          id="student-track"
          value={filter.track ?? ""}
          onChange={(e) => go({ track: e.target.value })}
          className={SELECT_CLS}
        >
          <option value="">All tracks</option>
          {TRACKS.map((track) => (
            <option key={track} value={track}>
              {track.charAt(0) + track.slice(1).toLowerCase()}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="student-tier" className={LABEL_CLS}>
          Plan
        </label>
        <select
          id="student-tier"
          value={filter.tier ?? ""}
          onChange={(e) => go({ tier: e.target.value })}
          className={SELECT_CLS}
        >
          <option value="">All plans</option>
          {SUBSCRIPTION_TIERS.map((tier) => (
            <option key={tier} value={tier}>
              {TIER_LABELS[tier]}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="student-status" className={LABEL_CLS}>
          Status
        </label>
        <select
          id="student-status"
          value={filter.status ?? ""}
          onChange={(e) => go({ status: e.target.value })}
          className={SELECT_CLS}
        >
          <option value="">Any status</option>
          {ACCOUNT_STATUSES.map((status) => (
            <option key={status} value={status}>
              {STATUS_LABELS[status]}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
