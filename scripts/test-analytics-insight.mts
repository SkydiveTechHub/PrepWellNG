import { test } from "node:test";
import assert from "node:assert/strict";
import {
  selectInsights,
  type Insight,
} from "../src/engines/analytics/insight";

function insight(
  kind: Insight["kind"],
  severity: Insight["severity"],
  headline = kind,
): Insight {
  return { kind, severity, headline };
}

test("orders by severity, most severe first", () => {
  const out = selectInsights(
    [
      insight("SUBJECT_STRENGTH", "WIN"),
      insight("PACING_SLOW", "WARNING"),
      insight("RAPID_GUESSING", "CRITICAL"),
    ],
    10,
  );
  assert.deepEqual(out.map((i) => i.severity), ["CRITICAL", "WARNING", "WIN"]);
});

test("is stable within a severity", () => {
  const out = selectInsights(
    [
      insight("WEAK_TOPIC", "WARNING", "first"),
      insight("DECAYED_TOPIC", "WARNING", "second"),
    ],
    10,
  );
  assert.deepEqual(out.map((i) => i.headline), ["first", "second"]);
});

test("caps at the limit", () => {
  const out = selectInsights(
    [
      insight("RAPID_GUESSING", "CRITICAL"),
      insight("WEAK_TOPIC", "WARNING"),
      insight("DECAYED_TOPIC", "WARNING"),
      insight("STALE_TOPIC", "INFO"),
    ],
    2,
  );
  assert.equal(out.length, 2);
  assert.deepEqual(out.map((i) => i.severity), ["CRITICAL", "WARNING"]);
});

test("keeps at most one WIN", () => {
  const out = selectInsights(
    [
      insight("SUBJECT_STRENGTH", "WIN", "win one"),
      insight("IMPROVING", "WIN", "win two"),
    ],
    10,
  );
  assert.deepEqual(out.map((i) => i.headline), ["win one"]);
});

test("returns an empty list for no insights", () => {
  assert.deepEqual(selectInsights([], 3), []);
});
