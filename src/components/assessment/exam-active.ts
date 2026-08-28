"use client";

import { useSyncExternalStore } from "react";

// Whether a student is mid-exam, published to the app chrome.
//
// A module store rather than context: the sidebar and the mobile nav are
// siblings of the exam in the dashboard layout, so a provider would have to
// wrap the whole layout to reach them. Nothing here belongs in React state —
// it flips twice per exam.

let active = false;
const listeners = new Set<() => void>();

/** Called by the exam surface as it mounts and unmounts. */
export function setExamActive(next: boolean): void {
  if (active === next) return;
  active = next;
  for (const notify of listeners) notify();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): boolean {
  return active;
}

/** The server renders the chrome before any exam exists. */
function getServerSnapshot(): boolean {
  return false;
}

export function useExamActive(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
