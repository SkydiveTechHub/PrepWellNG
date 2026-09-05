import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isSaturated,
  DRAW_LIMIT,
  MIN_NEW_PER_DRAW,
  MAX_DRAWS,
} from "../src/lib/question-provider/saturation";

test("a draw yielding too few new ids saturates", () => {
  assert.equal(
    isSaturated({ drawCount: 5, returnedCount: 50, newInLastDraw: 9 }),
    true,
  );
});

test("a draw just above the threshold does not saturate", () => {
  assert.equal(
    isSaturated({ drawCount: 5, returnedCount: 50, newInLastDraw: 10 }),
    false,
  );
});

test("a short draw means the pool is smaller than one batch", () => {
  assert.equal(
    isSaturated({ drawCount: 1, returnedCount: 37, newInLastDraw: 37 }),
    true,
  );
});

test("an empty draw saturates immediately", () => {
  // The 404 path: nothing there, never ask again.
  assert.equal(
    isSaturated({ drawCount: 1, returnedCount: 0, newInLastDraw: 0 }),
    true,
  );
});

test("the hard cap stops a pathologically deep pool", () => {
  assert.equal(
    isSaturated({ drawCount: MAX_DRAWS, returnedCount: 50, newInLastDraw: 40 }),
    true,
  );
});

test("the measured decay does NOT saturate early", () => {
  // Live measurement for chemistry/utme/2022 on 2026-09-02: successive draws
  // yielded 50, 39, 32, 26 new ids. If a threshold change makes this stop at
  // draw 4 we would cache roughly a third of that pool and call it done.
  const measured = [50, 39, 32, 26];
  measured.forEach((newInLastDraw, index) => {
    assert.equal(
      isSaturated({ drawCount: index + 1, returnedCount: 50, newInLastDraw }),
      false,
      `draw ${index + 1} (${newInLastDraw} new) should not saturate`,
    );
  });
});

test("the constants are the values the spec was calibrated on", () => {
  assert.equal(DRAW_LIMIT, 50);
  assert.equal(MIN_NEW_PER_DRAW, 10);
  assert.equal(MAX_DRAWS, 12);
});
