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
/**
 * Off under `next dev` unless NEXT_PUBLIC_SW_DEV=1. The worker serves
 * /_next/static/ cache-first, which is only safe when chunk names are content
 * hashed — Turbopack's dev chunks are not, so a cached chunk outlives the code
 * it was built from and the page dies with "module factory is not available".
 * Set the flag to exercise the PWA or push notifications locally.
 */
const ENABLED =
  process.env.NODE_ENV === "production" || process.env.NEXT_PUBLIC_SW_DEV === "1";

/** Removes a worker left over from a session that had the flag on. */
async function removeDevWorker() {
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map((reg) => reg.unregister()));
  // Unregistering stops the worker, but its caches would still be sitting
  // there the next time the flag is switched on.
  const keys = await caches.keys();
  await Promise.all(
    keys.filter((key) => key.startsWith("scholarscrib-")).map((key) => caches.delete(key)),
  );
}

export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (!ENABLED) {
      removeDevWorker().catch(() => {
        // Nothing registered, or storage is blocked. Either way, nothing to do.
      });
      return;
    }

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
