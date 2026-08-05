// Server-authoritative exam timing.
//
// The countdown in the browser is a convenience, not a control: it can be
// paused with devtools, the clock can be changed, and `timeSpentSeconds` was
// taken from the client verbatim and fed straight into analytics and the
// mastery engine. Everything here is derived from `attempt.startedAt` and the
// assessment's limit, both of which the client cannot influence.

/**
 * How far past the deadline a submission is still treated as on-time.
 *
 * The client auto-submits at 0:00, but that request still has to cross a
 * Nigerian mobile network. Without slack, a student on a slow connection is
 * punished for the network rather than for overrunning.
 */
export const SUBMIT_GRACE_SECONDS = 120;

export type AttemptTiming = {
  /** Wall-clock seconds since the attempt was created. */
  elapsedSeconds: number;
  /** The limit in seconds, or null for an untimed assessment. */
  allowedSeconds: number | null;
  /** Time to persist: the client's figure, clamped to what was physically possible. */
  timeSpentSeconds: number;
  /** True when the submission landed beyond the limit *and* the grace period. */
  exceededLimit: boolean;
  /** Server-computed deadline, or null when untimed. */
  deadlineAt: Date | null;
};

export function deadlineFor(
  startedAt: Date,
  timeLimitMinutes: number | null | undefined,
): Date | null {
  if (timeLimitMinutes == null || timeLimitMinutes <= 0) return null;
  return new Date(startedAt.getTime() + timeLimitMinutes * 60_000);
}

/**
 * How long an untimed attempt (e.g. the quick quiz) stays resumable before
 * it's treated as abandoned. Untimed assessments have no deadline to expire
 * against, so without a fallback window an abandoned attempt — and the same
 * handful of questions — would be handed back to the student forever.
 *
 * Shared by `reapStaleAttempts` and `findResumableAttempt` in
 * `attempt-lifecycle.ts` so the two can never drift apart.
 */
export const UNTIMED_STALE_HOURS = 24;
const UNTIMED_STALE_MS = UNTIMED_STALE_HOURS * 60 * 60 * 1000;

/**
 * Whether an IN_PROGRESS attempt should stop being resumable: past its
 * deadline plus grace when timed, or past the untimed fallback window when
 * not. The single source of truth for "abandoned" — both the reaper (marks
 * attempts TIMED_OUT) and the resume lookup (refuses to hand one back) call
 * this rather than each re-deriving the rule.
 */
export function isAttemptStale({
  startedAt,
  timeLimitMinutes,
  now,
  graceSeconds = SUBMIT_GRACE_SECONDS,
}: {
  startedAt: Date;
  timeLimitMinutes: number | null | undefined;
  now: Date;
  graceSeconds?: number;
}): boolean {
  const deadline = deadlineFor(startedAt, timeLimitMinutes);
  if (deadline) {
    return now.getTime() > deadline.getTime() + graceSeconds * 1000;
  }
  return now.getTime() - startedAt.getTime() > UNTIMED_STALE_MS;
}

/**
 * Reconciles what the client reported against what the clock allows.
 *
 * `reportedSeconds` is never trusted upward: it is clamped to the elapsed wall
 * time, and to the assessment's limit when there is one. A tab left open for
 * five hours on a one-hour paper records one hour, not five, and not whatever
 * number the client felt like sending.
 */
export function evaluateAttemptTiming({
  startedAt,
  timeLimitMinutes,
  reportedSeconds,
  now,
  graceSeconds = SUBMIT_GRACE_SECONDS,
}: {
  startedAt: Date;
  timeLimitMinutes: number | null | undefined;
  reportedSeconds: number;
  now: Date;
  graceSeconds?: number;
}): AttemptTiming {
  const elapsedSeconds = Math.max(
    0,
    Math.floor((now.getTime() - startedAt.getTime()) / 1000),
  );

  const allowedSeconds =
    timeLimitMinutes != null && timeLimitMinutes > 0
      ? timeLimitMinutes * 60
      : null;

  const reported =
    Number.isFinite(reportedSeconds) && reportedSeconds > 0
      ? Math.floor(reportedSeconds)
      : 0;

  const ceiling =
    allowedSeconds != null
      ? Math.min(elapsedSeconds, allowedSeconds)
      : elapsedSeconds;

  return {
    elapsedSeconds,
    allowedSeconds,
    timeSpentSeconds: Math.min(reported, ceiling),
    exceededLimit:
      allowedSeconds != null && elapsedSeconds > allowedSeconds + graceSeconds,
    deadlineAt: deadlineFor(startedAt, timeLimitMinutes),
  };
}
