"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { StatusBanner } from "@/components/admin/status-banner";

const INPUT_CLS =
  "w-full px-3 py-2 rounded-lg border border-border bg-card text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60";

export function StudentDangerZone({
  studentId,
  studentName,
  isActive,
  canSuspend,
  className,
}: {
  studentId: string;
  studentName: string;
  isActive: boolean;
  impact: Record<string, number>;
  canSuspend: boolean;
  canForceSignOut: boolean;
  canDelete: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function setActive(next: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/admin/api/students/${studentId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          next ? { isActive: true } : { isActive: false, reason },
        ),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Could not change the status");
        return;
      }
      setReason("");
      router.refresh();
    } catch {
      setError("Could not reach the server");
    } finally {
      setBusy(false);
    }
  }

  if (!canSuspend) {
    return (
      <p className={cn("text-sm text-muted", className)}>
        You do not have permission to change this account.
      </p>
    );
  }

  return (
    <div
      className={cn(
        "rounded-lg border border-border-strong bg-card p-4",
        className,
      )}
    >
      {error && <StatusBanner tone="error" title={error} className="mb-4" />}

      {isActive ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted">
            Suspending blocks {studentName} from signing in and ends any live
            session within a minute. It is reversible and destroys nothing.
          </p>
          <label htmlFor="suspend-reason" className="sr-only">
            Reason for suspension
          </label>
          <input
            id="suspend-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (recorded in the audit log)"
            className={INPUT_CLS}
          />
          <div>
            <Button
              onClick={() => setActive(false)}
              disabled={busy || reason.trim().length < 3}
            >
              {busy ? "Suspending…" : "Suspend account"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted">
            {studentName} is suspended and cannot sign in.
          </p>
          <div>
            <Button onClick={() => setActive(true)} disabled={busy}>
              {busy ? "Reactivating…" : "Reactivate account"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
