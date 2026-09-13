"use client";

import { useEffect } from "react";

/**
 * Registers the service worker and renders nothing.
 *
 * Two deliberate omissions. There is no reload on "controllerchange": a silent
 * reload discards a half-finished quiz. And there is no messaging to make the
 * waiting worker activate early — the worker itself does not call
 * skipWaiting(), so a new version takes over when every tab has closed, rather
 * than swapping itself in under a student mid-exam.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let registration: ServiceWorkerRegistration | undefined;

    // updateViaCache: "none" so the browser's HTTP cache can never hand the
    // registration a stale worker script. The no-store header on /sw.js says
    // the same thing; both, because either one alone has been known to lose.
    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then((reg) => {
        registration = reg;
      })
      .catch((error) => {
        // A failed registration must cost nothing: the app keeps working
        // exactly as it did before this feature existed.
        console.error("Service worker registration failed", error);
      });

    // Checking on tab focus rather than on an interval: a student who leaves
    // the app open for a week still picks up a new version on their next
    // glance, and a background tab does no work.
    const checkForUpdate = () => {
      if (document.visibilityState === "visible") {
        registration?.update().catch(() => {
          // Offline, or the server is down. Nothing to do and nothing to say.
        });
      }
    };

    document.addEventListener("visibilitychange", checkForUpdate);
    return () => document.removeEventListener("visibilitychange", checkForUpdate);
  }, []);

  return null;
}
