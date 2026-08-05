"use client";

import { useEffect } from "react";
import Link from "next/link";
import { LuTriangleAlert, LuRotateCcw } from "react-icons/lu";
import { Button } from "@/components/ui/button";

/**
 * Catches render and data errors anywhere under the dashboard. Without it a
 * single failed query — a dropped Supabase connection, say — takes the whole
 * app to a blank screen with no way back.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Dashboard error:", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-md py-20 text-center animate-fade-in">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-warning-soft text-warning">
        <LuTriangleAlert className="h-7 w-7" />
      </div>
      <h2 className="text-lg font-bold text-foreground">
        Something went wrong
      </h2>
      <p className="mt-1 text-sm text-muted">
        This page didn&apos;t load. Your progress is safe — try again, and if it
        keeps happening give it a minute.
      </p>
      {error.digest && (
        <p className="mt-2 font-mono text-[11px] text-muted">
          Reference: {error.digest}
        </p>
      )}
      <div className="mt-6 flex justify-center gap-3">
        <Button onClick={reset}>
          <LuRotateCcw className="h-4 w-4" />
          Try again
        </Button>
        <Link
          href="/dashboard"
          className="inline-flex h-10 items-center rounded-xl border border-border bg-card px-4 text-sm font-semibold text-foreground transition-colors hover:bg-secondary"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
