"use client";

import { useEffect, useState } from "react";
import { buttonClass } from "@/components/ui/button";
import { FormMessage } from "./section";
import type { PushCapability } from "@/lib/push-capability";
import type { NotificationPreferences } from "@/lib/push-validators";
import {
  checkWorkerReady,
  readPushState,
  subscribeThisDevice,
  unsubscribeThisDevice,
  type WorkerReadiness,
} from "@/lib/push-client";

export const PUSH_STATE_COPY: Record<string, string> = {
  unsupported: "This browser can't show ScholarsCrib notifications.",
  "ios-needs-install":
    "On iPhone and iPad, reminders need the app installed: tap Share, then Add to Home Screen, then open ScholarsCrib from your Home Screen.",
  denied: "Notifications are blocked for ScholarsCrib. Turn them on in your browser's site settings.",
  "needs-reload": "Almost there: close every ScholarsCrib tab, reopen the app, then try again.",
  failed: "Couldn't turn on notifications. Please try again.",
};

const TOGGLES: { key: keyof NotificationPreferences; label: string; hint: string }[] = [
  { key: "studyReminders", label: "Morning study reminder", hint: "Around 7am: today's plan and flashcards due." },
  { key: "streakReminders", label: "Streak reminder", hint: "Around 7pm, only if your streak is about to end." },
  { key: "announcements", label: "Announcements", hint: "Important news from ScholarsCrib." },
];

export function NotificationSettings({ initial }: { initial: NotificationPreferences }) {
  const [state, setState] = useState<PushCapability | null>(null);
  // Checked on mount so "Turn on" can prompt without spending the click's gesture.
  const [worker, setWorker] = useState<WorkerReadiness | null>(null);
  const [prefs, setPrefs] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    readPushState().then(setState, () => setState("unsupported"));
    checkWorkerReady().then(setWorker, () => setWorker("needs-reload"));
  }, []);

  async function enable() {
    setBusy(true);
    setError("");
    const result = await subscribeThisDevice();
    if (result === "needs-reload" || result === "unsupported") setWorker(result);
    else if (result !== "subscribed") setError(PUSH_STATE_COPY[result] ?? PUSH_STATE_COPY.failed);
    setState(await readPushState());
    setBusy(false);
  }

  async function disable() {
    setBusy(true);
    setError("");
    await unsubscribeThisDevice();
    setState(await readPushState());
    setBusy(false);
  }

  async function toggle(key: keyof NotificationPreferences) {
    const previous = prefs;
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    setError("");
    try {
      const res = await fetch("/api/user/notification-preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: next[key] }),
      });
      if (!res.ok) throw new Error(String(res.status));
    } catch {
      setPrefs(previous);
      setError("Couldn't save that change. Please try again.");
    }
  }

  if (state === null) return <p className="text-sm text-muted">Checking this device…</p>;

  const workerProblem = state === "default" && worker !== null && worker !== "ready" ? worker : null;

  return (
    <div>
      <FormMessage error={error} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">Notifications on this device</p>
          <p className="text-sm text-muted">
            {workerProblem
              ? PUSH_STATE_COPY[workerProblem]
              : state === "subscribed"
                ? "On"
                : state === "default"
                  ? "Off"
                  : PUSH_STATE_COPY[state]}
          </p>
        </div>
        {state === "subscribed" && (
          <button type="button" disabled={busy} onClick={disable} className={buttonClass("outline", "sm")}>
            {busy ? "Turning off…" : "Turn off"}
          </button>
        )}
        {state === "default" && !workerProblem && (
          <button type="button" disabled={busy || worker === null} onClick={enable} className={buttonClass("primary", "sm")}>
            {busy ? "Turning on…" : "Turn on"}
          </button>
        )}
      </div>

      <ul className="mt-5 space-y-4 border-t border-border pt-5">
        {TOGGLES.map((toggleItem) => (
          <li key={toggleItem.key} className="flex items-start justify-between gap-4">
            <label htmlFor={`pref-${toggleItem.key}`} className="min-w-0">
              <span className="block text-sm font-semibold text-foreground">{toggleItem.label}</span>
              <span className="block text-sm text-muted">{toggleItem.hint}</span>
            </label>
            <input
              id={`pref-${toggleItem.key}`}
              type="checkbox"
              role="switch"
              checked={prefs[toggleItem.key]}
              onChange={() => toggle(toggleItem.key)}
              className="mt-1 h-5 w-5 shrink-0 accent-primary"
            />
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs text-muted">These choices apply to all your devices.</p>
    </div>
  );
}
