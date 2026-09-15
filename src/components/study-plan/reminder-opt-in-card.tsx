"use client";

import { useEffect, useState } from "react";
import { buttonClass } from "@/components/ui/button";
import { isOptInSnoozed } from "@/lib/push-capability";
import { readPushState, subscribeThisDevice } from "@/lib/push-client";
import { PUSH_STATE_COPY } from "@/components/settings/notification-settings";

const SNOOZE_KEY = "scholarscrib.reminder-opt-in-snoozed-at";

function readSnooze(): number | null {
  try {
    const raw = window.localStorage.getItem(SNOOZE_KEY);
    return raw === null ? null : Number(raw);
  } catch {
    return null;
  }
}

function writeSnooze(at: number) {
  try {
    window.localStorage.setItem(SNOOZE_KEY, String(at));
  } catch {
    // Private mode: the card simply comes back next visit.
  }
}

/** Shown on the study plan page. Never prompts on its own: only on "Turn on". */
export function ReminderOptInCard({ enabled }: { enabled: boolean }) {
  const [visible, setVisible] = useState(false);
  const [iosHint, setIosHint] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Server-evaluated: push is off on this deployment.
    if (!enabled) return;
    if (isOptInSnoozed(readSnooze(), Date.now())) return;
    readPushState().then((state) => {
      if (state === "default") setVisible(true);
      if (state === "ios-needs-install") {
        setIosHint(true);
        setVisible(true);
      }
    }, () => undefined);
  }, [enabled]);

  if (!enabled || !visible) return null;

  function notNow() {
    writeSnooze(Date.now());
    setVisible(false);
  }

  async function turnOn() {
    setBusy(true);
    const result = await subscribeThisDevice();
    setBusy(false);
    if (result === "subscribed") {
      setVisible(false);
      return;
    }
    setMessage(PUSH_STATE_COPY[result] ?? PUSH_STATE_COPY.failed);
  }

  return (
    <div className="card mb-6 p-4 sm:p-5">
      <p className="text-sm font-bold text-foreground">Get a morning reminder of today&apos;s topics?</p>
      <p className="mt-1 text-sm text-muted">
        {iosHint ? PUSH_STATE_COPY["ios-needs-install"] : message || "One notification around 7am. Change it any time in Settings."}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {!iosHint && (
          <button type="button" disabled={busy} onClick={turnOn} className={buttonClass("primary", "sm")}>
            {busy ? "Turning on…" : "Turn on"}
          </button>
        )}
        <button type="button" onClick={notNow} className={buttonClass("outline", "sm")}>
          Not now
        </button>
      </div>
    </div>
  );
}
