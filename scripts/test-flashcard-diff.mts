import { test } from "node:test";
import assert from "node:assert/strict";
import { diffDeck, diffCounts, type ExistingCard } from "../src/lib/flashcard-diff";
import type { GeneratedCard } from "../src/lib/flashcard-content";

function card(sourceKey: string, text = "body"): GeneratedCard {
  return {
    sourceKey,
    cardType: "DEFINITION",
    prompt: sourceKey,
    payload: { term: sourceKey, definition: text },
    difficulty: "BASIC",
  };
}

/**
 * A stored row. `bodyKey` says which card's body it holds — normally the same
 * as `sourceKey`, but they are separate arguments so the legacy tests can build
 * an unkeyed row that nonetheless holds a known card's body.
 */
function row(opts: {
  id: string;
  sourceKey: string | null;
  orderIndex: number;
  bodyKey: string;
  text?: string;
}): ExistingCard {
  const body = card(opts.bodyKey, opts.text);
  return {
    id: opts.id,
    sourceKey: opts.sourceKey,
    orderIndex: opts.orderIndex,
    cardType: body.cardType,
    prompt: body.prompt,
    payload: body.payload,
    difficulty: body.difficulty,
  };
}

/** Three keyed rows holding a, b, c at positions 0, 1, 2. */
function abcRows(): ExistingCard[] {
  return [
    row({ id: "row-a", sourceKey: "a", orderIndex: 0, bodyKey: "a" }),
    row({ id: "row-b", sourceKey: "b", orderIndex: 1, bodyKey: "b" }),
    row({ id: "row-c", sourceKey: "c", orderIndex: 2, bodyKey: "c" }),
  ];
}

test("regenerating an identical deck changes nothing", () => {
  const diff = diffDeck(abcRows(), [card("a"), card("b"), card("c")]);

  assert.deepEqual(diffCounts(diff), { unchanged: 3, updated: 0, created: 0, removed: 0 });
  assert.equal(
    diff.unchanged.every((u) => u.needsWrite === false),
    true,
    "a fully-keyed deck at rest writes nothing at all",
  );
});

test("an edited block updates exactly its own card", () => {
  const diff = diffDeck(abcRows(), [card("a"), card("b", "REWRITTEN"), card("c")]);

  assert.deepEqual(diffCounts(diff), { unchanged: 2, updated: 1, created: 0, removed: 0 });
  assert.equal(diff.updated[0].id, "row-b");
  assert.equal(diff.updated[0].card.sourceKey, "b");
});

test("reordering blocks keeps every card but rewrites its position", () => {
  const diff = diffDeck(abcRows(), [card("c"), card("b"), card("a")]);

  assert.deepEqual(diffCounts(diff), { unchanged: 3, updated: 0, created: 0, removed: 0 });
  const moved = diff.unchanged.find((u) => u.card.sourceKey === "a");
  assert.equal(moved?.orderIndex, 2, "a is now last");
  assert.equal(moved?.needsWrite, true, "a moved, so its row must be written");
  const stayed = diff.unchanged.find((u) => u.card.sourceKey === "b");
  assert.equal(stayed?.needsWrite, false, "b did not move");
});

test("a removed block removes exactly its card", () => {
  const diff = diffDeck(abcRows(), [card("a"), card("c")]);

  assert.deepEqual(diffCounts(diff), { unchanged: 2, updated: 0, created: 0, removed: 1 });
  assert.deepEqual(diff.removed, [{ id: "row-b" }]);
});

test("an added block creates exactly its card", () => {
  const rows = abcRows().slice(0, 2);
  const diff = diffDeck(rows, [card("a"), card("b"), card("d")]);

  assert.deepEqual(diffCounts(diff), { unchanged: 2, updated: 0, created: 1, removed: 0 });
  assert.equal(diff.created[0].card.sourceKey, "d");
  assert.equal(diff.created[0].orderIndex, 2);
});

test("a legacy deck with no keys matches by position and gets stamped", () => {
  const rows = [
    row({ id: "legacy-0", sourceKey: null, orderIndex: 0, bodyKey: "a" }),
    row({ id: "legacy-1", sourceKey: null, orderIndex: 1, bodyKey: "b" }),
    row({ id: "legacy-2", sourceKey: null, orderIndex: 2, bodyKey: "c" }),
  ];
  const diff = diffDeck(rows, [card("a"), card("b"), card("c")]);

  assert.deepEqual(diffCounts(diff), { unchanged: 3, updated: 0, created: 0, removed: 0 });
  assert.equal(
    diff.unchanged.every((u) => u.needsWrite === true),
    true,
    "every legacy row still needs its key stamped",
  );
  assert.equal(diff.unchanged.find((u) => u.id === "legacy-1")?.card.sourceKey, "b");
});

test("keyed rows win before the positional fallback runs", () => {
  // "b" is keyed but sits last; the unkeyed rows must not steal it on the way past.
  const rows = [
    row({ id: "legacy-0", sourceKey: null, orderIndex: 0, bodyKey: "a" }),
    row({ id: "legacy-1", sourceKey: null, orderIndex: 1, bodyKey: "z" }),
    row({ id: "keyed-b", sourceKey: "b", orderIndex: 2, bodyKey: "b" }),
  ];
  const diff = diffDeck(rows, [card("b"), card("a"), card("z")]);

  assert.deepEqual(diffCounts(diff), { unchanged: 3, updated: 0, created: 0, removed: 0 });
  assert.equal(diff.unchanged.find((u) => u.card.sourceKey === "b")?.id, "keyed-b");
  assert.equal(diff.unchanged.find((u) => u.card.sourceKey === "a")?.id, "legacy-0");
  assert.equal(diff.unchanged.find((u) => u.card.sourceKey === "z")?.id, "legacy-1");
});

test("a legacy deck that gained a leading block shifts every positional match", () => {
  // Documented consequence, not an accident: with no keys to match on, position
  // is all there is, so inserting at the top re-points every legacy row. Those
  // two cards lose their schedule — once, and only for decks predating the key.
  const rows = [
    row({ id: "legacy-0", sourceKey: null, orderIndex: 0, bodyKey: "a" }),
    row({ id: "legacy-1", sourceKey: null, orderIndex: 1, bodyKey: "b" }),
  ];
  const diff = diffDeck(rows, [card("new"), card("a"), card("b")]);

  assert.deepEqual(diffCounts(diff), { unchanged: 0, updated: 2, created: 1, removed: 0 });
  assert.equal(diff.updated.find((u) => u.id === "legacy-0")?.card.sourceKey, "new");
});

test("an empty stored deck creates everything", () => {
  const diff = diffDeck([], [card("a"), card("b")]);
  assert.deepEqual(diffCounts(diff), { unchanged: 0, updated: 0, created: 2, removed: 0 });
});

test("payload key order does not count as a change", () => {
  const reordered: GeneratedCard = {
    ...card("a"),
    payload: { definition: "body", term: "a" } as GeneratedCard["payload"],
  };
  const diff = diffDeck([abcRows()[0]], [reordered]);
  assert.deepEqual(diffCounts(diff), { unchanged: 1, updated: 0, created: 0, removed: 0 });
});
