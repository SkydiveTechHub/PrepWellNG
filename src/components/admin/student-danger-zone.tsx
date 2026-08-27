"use client";

import { cn } from "@/lib/utils";

export function StudentDangerZone({
  isActive,
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
  return (
    <div
      className={cn("rounded-lg border border-border-strong bg-card p-4", className)}
    >
      <p className="text-sm text-muted">
        This account is currently {isActive ? "active" : "suspended"}.
      </p>
    </div>
  );
}
