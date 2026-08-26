// What counts as a student leaving an exam.
//
// Kept free of React and the DOM so the rules can be unit-tested; the session
// hook only reads the clock and applies the answer.

/**
 * How long a student must be away before it is recorded.
 *
 * Below this sits everything innocent that hides a tab on a phone: a
 * screenshot, a glanced-at notification, a mistap. An absence *equal* to the
 * floor is not counted — the boundary belongs to the benign side.
 */
export const AWAY_FLOOR_MS = 3000;

/**
 * Whether a return to visibility should be recorded as having left.
 *
 * `hiddenAt` is null when the session never saw the matching departure — a
 * session resumed while already visible, for instance. Nothing to measure, so
 * nothing is counted rather than something guessed.
 */
export function countsAsAway(hiddenAt: number | null, visibleAt: number): boolean {
  if (hiddenAt == null) return false;
  return visibleAt - hiddenAt > AWAY_FLOOR_MS;
}

/** The running total after a return to visibility. */
export function nextAwayCount(
  current: number,
  hiddenAt: number | null,
  visibleAt: number,
): number {
  return countsAsAway(hiddenAt, visibleAt) ? current + 1 : current;
}

/**
 * A count read back from storage, which may predate this field or be corrupt.
 * Anything unusable is zero rather than a reason to discard the whole session.
 */
export function sanitiseAwayCount(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return 0;
  return Math.floor(value);
}
