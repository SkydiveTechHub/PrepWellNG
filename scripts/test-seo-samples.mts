import { test } from "node:test";
import assert from "node:assert/strict";
import { pickSamples } from "../src/lib/seo/samples";

const items = Array.from({ length: 20 }, (_, i) => ({ id: `q${i}` }));
const ids = (picked: { id: string }[]) => picked.map((p) => p.id);

test("the same seed always yields the same questions in the same order", () => {
  // A page whose visible content shuffles on every revalidation looks
  // unstable to crawlers and is impossible to debug rankings against.
  assert.deepEqual(ids(pickSamples(items, 3, "topic-a")), ids(pickSamples(items, 3, "topic-a")));
});

test("different pages get different samples", () => {
  assert.notDeepEqual(ids(pickSamples(items, 3, "topic-a")), ids(pickSamples(items, 3, "topic-b")));
});

test("the pick does not depend on the order the rows arrived in", () => {
  // Prisma is free to return rows in any order without an ORDER BY, so the
  // selection has to be stable against that.
  const reversed = [...items].reverse();
  assert.deepEqual(ids(pickSamples(items, 3, "topic-a")), ids(pickSamples(reversed, 3, "topic-a")));
});

test("asking for more than exists returns everything, without duplicates", () => {
  const picked = pickSamples(items.slice(0, 2), 5, "topic-a");
  assert.equal(picked.length, 2);
  assert.equal(new Set(ids(picked)).size, 2);
});

test("the requested count is honoured and the picks are distinct", () => {
  const picked = pickSamples(items, 5, "topic-a");
  assert.equal(picked.length, 5);
  assert.equal(new Set(ids(picked)).size, 5);
});

test("degenerate counts return nothing rather than throwing", () => {
  assert.deepEqual(pickSamples(items, 0, "s"), []);
  assert.deepEqual(pickSamples(items, -1, "s"), []);
  assert.deepEqual(pickSamples([], 3, "s"), []);
});
