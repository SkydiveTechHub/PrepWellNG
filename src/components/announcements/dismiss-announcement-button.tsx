"use client";

import { useState, type ReactNode } from "react";
import { LuX } from "react-icons/lu";

/** Wraps the banner so dismissing hides it immediately, before the request lands. */
export function DismissibleAnnouncement({ id, children }: { id: string; children: ReactNode }) {
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;

  function dismiss() {
    setHidden(true);
    // Fire and forget: if it fails, the banner simply returns on the next load.
    fetch(`/api/announcements/${id}/dismiss`, { method: "POST" }).catch(() => undefined);
  }

  return (
    <div role="status" className="card mb-6 flex items-start gap-3 p-4">
      <div className="min-w-0 flex-1">{children}</div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss announcement"
        className="shrink-0 rounded-lg p-1 text-muted hover:bg-secondary hover:text-foreground"
      >
        <LuX aria-hidden className="h-4 w-4" />
      </button>
    </div>
  );
}
