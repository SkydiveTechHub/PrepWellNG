"use client";

import { useRouter } from "next/navigation";
import { AUDIT_ACTIONS, type AuditFilter } from "@/lib/admin-audit-filter";

const SELECT_CLS =
  "px-3 py-2 rounded-lg border border-border bg-card text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60";
const LABEL_CLS = "text-[11px] font-semibold uppercase tracking-wider text-muted";

function toDateInput(value: Date | null): string {
  return value ? value.toISOString().slice(0, 10) : "";
}

export function AuditFilterBar({
  filter,
  actors,
}: {
  filter: AuditFilter;
  actors: Array<{ id: string; label: string }>;
}) {
  const router = useRouter();

  // Any change resets to page 1: staying on page 7 of a narrower result set
  // shows an empty table.
  function go(next: Partial<Record<"actor" | "action" | "from" | "to", string>>) {
    const params = new URLSearchParams({
      ...(filter.actorId ? { actor: filter.actorId } : {}),
      ...(filter.action ? { action: filter.action } : {}),
      ...(filter.from ? { from: toDateInput(filter.from) } : {}),
      ...(filter.to ? { to: toDateInput(filter.to) } : {}),
    });
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    const query = params.toString();
    router.replace(query ? `/admin/audit?${query}` : "/admin/audit");
  }

  return (
    <div className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-border-strong bg-card p-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="audit-actor" className={LABEL_CLS}>
          Actor
        </label>
        <select
          id="audit-actor"
          value={filter.actorId ?? ""}
          onChange={(e) => go({ actor: e.target.value })}
          className={SELECT_CLS}
        >
          <option value="">All actors</option>
          {actors.map((actor) => (
            <option key={actor.id} value={actor.id}>
              {actor.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="audit-action" className={LABEL_CLS}>
          Action
        </label>
        <select
          id="audit-action"
          value={filter.action ?? ""}
          onChange={(e) => go({ action: e.target.value })}
          className={SELECT_CLS}
        >
          <option value="">All actions</option>
          {AUDIT_ACTIONS.map((action) => (
            <option key={action} value={action}>
              {action}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="audit-from" className={LABEL_CLS}>
          From
        </label>
        <input
          id="audit-from"
          type="date"
          value={toDateInput(filter.from)}
          onChange={(e) => go({ from: e.target.value })}
          className={SELECT_CLS}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="audit-to" className={LABEL_CLS}>
          To
        </label>
        <input
          id="audit-to"
          type="date"
          value={toDateInput(filter.to)}
          onChange={(e) => go({ to: e.target.value })}
          className={SELECT_CLS}
        />
      </div>
    </div>
  );
}
