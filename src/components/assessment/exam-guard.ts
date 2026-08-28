// Which clicks during an exam are a student leaving, and which are not.
//
// Kept free of React and the DOM so the rules can be unit-tested: the hook that
// uses this only reads an event into a `NavigationIntent` and acts on the answer.

/** A click on an anchor, reduced to the facts that decide whether to intercept it. */
export type NavigationIntent = {
  /** The anchor's href. Absolute in the DOM, but relative values resolve too. */
  href: string | null;
  /** The URL the exam is being taken at. */
  currentUrl: string;
  target: string | null;
  download: boolean;
  /** Ctrl/Cmd/Shift/Alt held, or a non-primary mouse button — opens elsewhere. */
  modified: boolean;
  /** Another handler already cancelled the click. */
  defaultPrevented: boolean;
};

/**
 * Where this click would take the student, or null when it is not a departure
 * worth interrupting.
 *
 * Null covers more than "external": a modified click and `target="_blank"` open
 * a second tab and leave the exam sitting where it is, a download does not
 * navigate at all, and `mailto:`/`tel:` hand off to another app. Interrupting
 * any of those would be a dialog for something that never happened.
 */
export function guardedDestination(intent: NavigationIntent): string | null {
  const { href, currentUrl, target, download, modified, defaultPrevented } = intent;

  if (defaultPrevented || modified || download || !href) return null;
  if (target && target !== "_self") return null;

  let destination: URL;
  let current: URL;
  try {
    current = new URL(currentUrl);
    destination = new URL(href, currentUrl);
  } catch {
    // An href we cannot parse is not one we can meaningfully guard.
    return null;
  }

  // Also rules out mailto: and tel:, whose origin is "null".
  if (destination.origin !== current.origin) return null;

  // A hash-only link scrolls within the exam rather than leaving it, so the
  // comparison deliberately ignores the hash.
  const samePage =
    destination.pathname === current.pathname &&
    destination.search === current.search;
  if (samePage) return null;

  return `${destination.pathname}${destination.search}${destination.hash}`;
}
