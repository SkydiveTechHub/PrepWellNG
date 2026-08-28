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
  impact,
  canSuspend,
  canForceSignOut,
  canDelete,
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
  const [confirmText, setConfirmText] = useState("");

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

  async function forceSignOut() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/admin/api/students/${studentId}/force-signout`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Could not sign the student out");
        return;
      }
      router.refresh();
    } catch {
      setError("Could not reach the server");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/admin/api/students/${studentId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Could not delete the account");
        return;
      }
      // The record is gone; staying on its detail page would 404 on refresh.
      router.push("/admin/students");
    } catch {
      setError("Could not reach the server");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={cn(
        "rounded-lg border border-border-strong bg-card p-4",
        className,
      )}
    >
      {error && <StatusBanner tone="error" title={error} className="mb-4" />}

      {canSuspend && (
        isActive ? (
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
        )
      )}

      {(canForceSignOut || canDelete) && (
        <div className="mt-4 border-t border-border-strong pt-4 flex flex-col gap-4">
          {canForceSignOut && (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-muted">
                Force sign-out ends every live session within a minute. The
                password is unchanged — {studentName} can sign straight back in.
                Use it when a session is on a lost or shared device.
              </p>
              <div>
                <Button
                  variant="secondary"
                  onClick={forceSignOut}
                  disabled={busy}
                >
                  {busy ? "Working…" : "Force sign-out"}
                </Button>
              </div>
            </div>
          )}

          {canDelete && (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-muted">
                Deleting {studentName} is permanent and destroys:
              </p>
              <ul className="text-sm text-muted">
                {Object.entries(impact)
                  .filter(([, count]) => count > 0)
                  .map(([label, count]) => (
                    <li key={label}>
                      <span className="tabular-nums text-foreground">{count}</span>{" "}
                      {label.toLowerCase()}
                    </li>
                  ))}
                {Object.values(impact).every((count) => count === 0) && (
                  <li>No associated records.</li>
                )}
              </ul>
              <p className="text-sm text-muted">
                Suspending instead keeps all of it and is reversible. To delete,
                type <strong>{studentName}</strong> below.
              </p>
              <label htmlFor="delete-confirm" className="sr-only">
                Type the student name to confirm deletion
              </label>
              <input
                id="delete-confirm"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={studentName}
                className={INPUT_CLS}
              />
              <div>
                <Button
                  onClick={remove}
                  disabled={busy || confirmText !== studentName}
                >
                  {busy ? "Deleting…" : "Delete account permanently"}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
