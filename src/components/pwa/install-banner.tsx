"use client";

import { useCallback, useEffect, useState } from "react";
import { LuDownload, LuShare, LuX } from "react-icons/lu";
import { Button } from "@/components/ui/button";

// Versioned, so a future change to what the banner says can legitimately ask
// again rather than being silenced forever by an old dismissal.
const DISMISS_KEY = "scholarscrib:install-dismissed:v1";

/**
 * The Chrome/Edge install event. It is not in lib.dom, because it is not a
 * standard: Safari has no equivalent, which is why the iOS branch below
 * exists at all.
 */
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

// Private mode throws on any localStorage access, so every read and write is
// guarded. A student in private mode simply sees the banner again.
function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

function writeDismissed() {
  try {
    window.localStorage.setItem(DISMISS_KEY, "1");
  } catch {
    // Nothing to do: the banner reappears next visit, which is acceptable.
  }
}

export function InstallBanner() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);
  const [dismissed, setDismissed] = useState(true); // Hidden until proven otherwise.

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches;
    // iOS Safari reports an installed app through a non-standard property.
    const iosStandalone =
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (standalone || iosStandalone) return;

    if (readDismissed()) return;
    // Only knowable on the client (localStorage, matchMedia, navigator), so
    // this has to be set from the effect rather than during render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDismissed(false);

    // iPadOS 13+ Safari reports a desktop Mac user agent, so a touch-capable
    // "Mac" is treated as iOS too; a real desktop Mac reports 0 touch points.
    const isIos =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    if (isIos) {
      // Safari never fires beforeinstallprompt, so instructions are the only
      // option on the platform where a home-screen icon matters most.
      setShowIosHint(true);
      return;
    }

    const onBeforeInstallPrompt = (event: Event) => {
      // Suppress Chrome's own mini-infobar so there is one invitation, not two.
      event.preventDefault();
      setPromptEvent(event as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    return () =>
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
  }, []);

  const dismiss = useCallback(() => {
    writeDismissed();
    setDismissed(true);
  }, []);

  const install = useCallback(async () => {
    if (!promptEvent) return;
    await promptEvent.prompt();
    await promptEvent.userChoice;
    setPromptEvent(null);
    // The student has answered the browser's own dialog either way. Re-inviting
    // someone who just said no is exactly the nagging the dismissal key exists
    // to prevent, so both outcomes persist it.
    dismiss();
  }, [promptEvent, dismiss]);

  if (dismissed) return null;
  if (!promptEvent && !showIosHint) return null;

  return (
    <section className="flex flex-wrap items-center gap-4 rounded-2xl border border-border bg-primary-soft p-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-card text-primary">
        <LuDownload className="h-5 w-5" aria-hidden />
      </span>
      <div className="min-w-[12rem] flex-1">
        <h2 className="text-sm font-bold text-foreground">
          Install ScholarsCrib
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-primary-soft-foreground">
          {showIosHint ? (
            <>
              Tap the Share button{" "}
              <LuShare className="inline h-3.5 w-3.5 align-text-bottom" aria-hidden />{" "}
              in Safari, then &ldquo;Add to Home Screen&rdquo; to open
              ScholarsCrib like an app.
            </>
          ) : (
            <>Add it to your home screen to open it faster, straight from your phone.</>
          )}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {promptEvent ? (
          <Button variant="primary" size="sm" onClick={install}>
            Install
          </Button>
        ) : null}
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={dismiss}
          aria-label="Dismiss the install prompt"
        >
          <LuX className="h-4 w-4" aria-hidden />
        </Button>
      </div>
    </section>
  );
}
