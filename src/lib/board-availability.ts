// Whether an exam board is worth letting a student walk into.
//
// This replaces a hard-coded "coming soon" list. That list was a promise made
// in constants: someone had to remember to delete an entry the day the bank
// filled up, and until they did, ready content stayed invisible. Worse, the
// list could go the other way — a board marked open whose bank had been
// emptied or never tagged would hand a student an empty picker.
//
// So readiness is derived from what the bank actually holds, per surface. The
// two practice surfaces have genuinely different requirements:
//
//   Past questions — a paper only has to be *listable*. Questions we do not
//   hold are pulled from the provider on the way into the quiz, so the unit of
//   evidence is a paper on offer, not a question in the table.
//
//   Mock exam — scoped by class and term, which a question reaches only
//   through its topic's curriculum level. An untagged question is invisible
//   here however many of them there are, so the unit is a tagged question.
//
// Pure and dependency-free on purpose: the pickers run this in the browser
// over data they already fetched, and it is unit-tested without a database.

export type BoardSurface = "PAST_QUESTIONS" | "MOCK_EXAM";

export type SurfaceBar = {
  /** Subjects that must clear `minPerSubject` before the board opens. */
  minSubjects: number;
  /** What one subject must hold to count. Papers, or tagged questions. */
  minPerSubject: number;
  /** The unit `minPerSubject` counts, for the message. */
  unit: string;
};

/**
 * The bars are deliberately about breadth, not totals. A candidate registers
 * eight or nine subjects, so a board holding two thousand questions in one
 * subject is useless to almost everyone; four subjects of moderate depth is
 * a board worth opening. Raising or lowering these is the whole knob.
 */
export const SURFACE_BARS: Record<BoardSurface, SurfaceBar> = {
  PAST_QUESTIONS: { minSubjects: 4, minPerSubject: 1, unit: "paper" },
  MOCK_EXAM: { minSubjects: 3, minPerSubject: 20, unit: "syllabus-tagged question" },
};

export type BoardStatus = {
  board: string;
  ready: boolean;
  /** Subjects clearing the per-subject bar. */
  qualifying: number;
  /** Subjects with anything at all — including those short of the bar. */
  started: number;
  required: number;
  /** What to tell a student who can't enter. Null when they can. */
  reason: string | null;
};

/**
 * A board's status from its per-subject counts.
 *
 * `perSubject` holds one entry per subject that has anything for this board;
 * subjects with nothing are simply absent, since a board with forty untouched
 * subjects and one full one is no readier than a board with one subject.
 */
export function assessBoard(
  surface: BoardSurface,
  board: string,
  perSubject: readonly number[],
): BoardStatus {
  const bar = SURFACE_BARS[surface];
  const qualifying = perSubject.filter((n) => n >= bar.minPerSubject).length;
  const started = perSubject.filter((n) => n > 0).length;
  const ready = qualifying >= bar.minSubjects;

  return {
    board,
    ready,
    qualifying,
    started,
    required: bar.minSubjects,
    reason: ready ? null : shortfall(bar, board, qualifying, started),
  };
}

/**
 * Why the board is shut, in a student's words.
 *
 * "Coming soon" told nobody anything and aged badly. Naming the actual
 * shortfall means the tag is true on the day it is written and on the day it
 * disappears, and it tells a student whether to check back next week or next
 * term.
 */
function shortfall(
  bar: SurfaceBar,
  board: string,
  qualifying: number,
  started: number,
): string {
  if (started === 0) return `No ${board} questions loaded yet`;
  if (qualifying === 0) {
    return `${board} subjects are still short of a full ${bar.unit} set`;
  }
  return `${qualifying} of ${bar.minSubjects} ${board} subjects ready`;
}

/** Convenience: statuses for several boards at once, keyed by board. */
export function assessBoards(
  surface: BoardSurface,
  perBoard: Record<string, readonly number[]>,
): Record<string, BoardStatus> {
  const out: Record<string, BoardStatus> = {};
  for (const [board, counts] of Object.entries(perBoard)) {
    out[board] = assessBoard(surface, board, counts);
  }
  return out;
}
