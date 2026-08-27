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
  armed,
  fallbackHref,
}: {
  /**
   * True only while clicks should be intercepted. Goes false during a submit
   * request so the student can navigate the confirmation UI it produces, but
   * the attempt is still at risk until that request resolves — see `armed`.
   */
  active: boolean;
  /**
   * True whenever an attempt exists and could still be lost, including
   * across the submit window. Governs the history sentinel and the
   * `popstate` listener, which must stay attached for the whole life of the
   * attempt — a pop during submit still needs to be caught and repaired.
   */
  armed: boolean;
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

  // Re-arm on every activation. Today the component always unmounts on exit,
  // so this is inert, but if a guarded link ever reused the same component
  // instance (same route, different params), a stale `true` here would leave
  // the guard silently disarmed for the rest of the exam.
  useEffect(() => {
    if (active) leavingRef.current = false;
  }, [active]);

  // ── In-app links ─────────────────────────────────────────
  // One capture-phase listener on the document catches the sidebar, the mobile
  // nav and the user menu without any of them knowing an exam exists. Only
  // `preventDefault` is called, never `stopPropagation`: Next's Link handler
  // runs the anchor's own `onClick` (e.g. closing a mobile drawer) before
  // checking `event.defaultPrevented` and bailing out of navigation, so
  // stopping propagation here would silently swallow that `onClick` along
  // with the navigation we're trying to block.
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
  //
  // The sentinel is pushed at most once per mount, guarded by a ref: this
  // effect re-runs on every submit failure (`armed` toggles false→true), and
  // pushing a fresh entry each time would stack one extra history entry per
  // failed submit, forcing the student to press back once per retry just to
  // reach the exam URL they're already on.
  //
  // This effect is keyed on `armed`, not `active`, so the listener (and the
  // sentinel it maintains) stays attached for the whole life of the attempt,
  // including while a submit request is in flight and clicks are briefly not
  // being intercepted.
  const sentinelPushedRef = useRef(false);

  // Mirrored into a ref so the popstate handler (registered while `armed`,
  // which spans the submit window) can still tell whether clicks are
  // currently being intercepted, without retriggering the effect below.
  const activeRef = useRef(active);
  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  useEffect(() => {
    if (!armed) return;

    if (!sentinelPushedRef.current) {
      window.history.pushState(null, "", window.location.href);
      sentinelPushedRef.current = true;
    }

    function onPopState() {
      if (leavingRef.current) return;
      // Always re-push, even mid-submit: this is what repairs the stack when
      // a pop sneaks through while `active` is false. Only surface the
      // dialog when clicks are currently being intercepted — a pop that
      // lands during a submit request is a moment from the results page and
      // must not interrupt the student with a prompt they can't act on yet.
      window.history.pushState(null, "", window.location.href);
      if (activeRef.current) setPending({ kind: "back" });
    }

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [armed]);

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
