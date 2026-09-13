"use client";

import { useEffect } from "react";
import "./globals.css";

/**
 * Last-resort boundary. A segment's error.tsx does not wrap the layout in its
 * own segment, so a throw from (dashboard)/layout.tsx — or the root layout —
 * lands here. Without this file production rendered a blank page with no
 * digest to match against the Vercel logs.
 *
 * It replaces the root layout while active, so it brings its own <html>,
 * <body> and stylesheet. Kept free of app components: whatever broke the
 * layout may well break them too.
 */
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error("Global error:", error);
  }, [error]);

  return (
    <html lang="en" className="h-full">
      <body className="h-full bg-background text-foreground">
        <title>Something went wrong | ScholarsCrib</title>
        <main className="mx-auto flex min-h-full max-w-md flex-col items-center justify-center px-4 py-20 text-center">
          <h1 className="text-lg font-bold">Something went wrong</h1>
          <p className="mt-1 text-sm text-muted">
            This page didn&apos;t load. Your progress is safe — try again, and
            if it keeps happening give it a minute.
          </p>
          {error.digest && (
            <p className="mt-2 font-mono text-[11px] text-muted">
              Reference: {error.digest}
            </p>
          )}
          <div className="mt-6 flex justify-center gap-3">
            <button
              type="button"
              onClick={() => unstable_retry()}
              className="inline-flex h-10 items-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
            >
              Try again
            </button>
            {/* A full reload rather than next/link: the client router itself
                may be what failed. */}
            <button
              type="button"
              onClick={() => window.location.assign("/")}
              className="inline-flex h-10 items-center rounded-xl border border-border bg-card px-4 text-sm font-semibold transition-colors hover:bg-secondary"
            >
              Go home
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
