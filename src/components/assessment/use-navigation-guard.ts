"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { guardedDestination } from "./exam-guard";
import { setExamActive } from "./exam-active";

// React glue around `exam-guard`. Which clicks count as leaving is decided
// there, where it is unit-tested; this file only listens and navigates.

/** What the student is trying to do, held until they confirm or cancel. */
export type PendingExit =
  | { kind: "link"; href: string }
  | { kind: "back" };

export type NavigationGuard = ReturnType<typeof useNavigationGuard>;

export function useNavigationGuard({
  active,
  fallbackHref,
}: {
  /** True while an exam is in progress. */
  active: boolean;
  /** Where the browser's back button lands once the student confirms. */
  fallbackHref: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<PendingExit | null>(null);

  /**
   * Set the moment the student confirms, so the navigation we perform
   * ourselves is not caught by our own listeners and re-prompted.
   */
  const leavingRef = useRef(false);

  // Publish to the app chrome so it can stop prefetching routes the student is
  // being warned away from — on a metered mobile connection that is real data.
  useEffect(() => {
    setExamActive(active);
    return () => setExamActive(false);
  }, [active]);

  // ── In-app links ─────────────────────────────────────────
  // One capture-phase listener on the document catches the sidebar, the mobile
  // nav and the user menu without any of them knowing an exam exists. Capture
  // runs before React's own root listener, so `stopPropagation` keeps `Link`
  // from starting the navigation at all rather than racing it.
  useEffect(() => {
    if (!active) return;

    function onClick(event: MouseEvent) {
      if (leavingRef.current) return;

      const anchor = (event.target as Element | null)?.closest?.("a");
      if (!anchor) return;

      const destination = guardedDestination({
        href: anchor.getAttribute("href"),
        currentUrl: window.location.href,
        target: anchor.getAttribute("target"),
        download: anchor.hasAttribute("download"),
        modified:
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey,
        defaultPrevented: event.defaultPrevented,
      });
      if (!destination) return;

      event.preventDefault();
      event.stopPropagation();
      setPending({ kind: "link", href: destination });
    }

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [active]);

  // ── Browser back ─────────────────────────────────────────
  // `popstate` only fires once the history entry is already gone, so there is
  // nothing left to cancel. The fix is a duplicate entry pushed up front: back
  // pops that instead of leaving the exam, and we immediately push another to
  // stay armed. Both entries carry the exam's own URL, so nothing visibly moves.
  useEffect(() => {
    if (!active) return;

    window.history.pushState(null, "", window.location.href);

    function onPopState() {
      if (leavingRef.current) return;
      window.history.pushState(null, "", window.location.href);
      setPending({ kind: "back" });
    }

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [active]);

  const confirmLeave = useCallback(() => {
    if (!pending) return;
    leavingRef.current = true;
    setPending(null);
    // A back press is answered with a push rather than `router.back()`: the
    // guard's own duplicate entry makes "one step back" ambiguous, and landing
    // somewhere predictable beats unwinding history correctly.
    router.push(pending.kind === "link" ? pending.href : fallbackHref);
  }, [pending, router, fallbackHref]);

  const cancelLeave = useCallback(() => setPending(null), []);

  return { pending, confirmLeave, cancelLeave };
}
