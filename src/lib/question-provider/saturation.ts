// When to stop drawing a filter.
//
// The provider caps `limit` at 50 and exposes no offset, page or total, and a
// measurement on 2026-09-02 showed draws are randomly redrawn from a pool of
// roughly 300-400 per filter — not a 40-question paper. So "keep going until a
// draw yields nothing new" is a coupon-collector problem that would never
// terminate inside a sane budget. We stop on diminishing returns instead.

/** Their maximum, and what we always request. */
export const DRAW_LIMIT = 50;

/** Below this many new ids in a draw, the pool's useful yield has collapsed. */
export const MIN_NEW_PER_DRAW = 10;

/** At 12 draws we expect ~85% of a 350-question pool. */
export const MAX_DRAWS = 12;

export function isSaturated(input: {
  drawCount: number;
  returnedCount: number;
  newInLastDraw: number;
}): boolean {
  // Fewer than a full batch: their bank for this filter is smaller than one
  // draw, so we have just seen all of it. Also covers the 404/empty case.
  if (input.returnedCount < DRAW_LIMIT) return true;

  if (input.newInLastDraw < MIN_NEW_PER_DRAW) return true;

  return input.drawCount >= MAX_DRAWS;
}
