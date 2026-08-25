// Matches a regenerated deck against the cards already stored for it, so a
// rebuild can update in place instead of deleting and recreating. Deleting a
// Flashcard cascades away every student's FlashcardReview and
// FlashcardReviewLog rows for it (prisma/schema.prisma), so "which cards are
// the same card" is a data-loss question, not a cosmetic one.
//
// Pure by design: the write path in flashcards.ts computes the diff before it
// opens a transaction, which is what makes this testable without a database.

import type { GeneratedCard } from "./flashcard-content";

export type ExistingCard = {
  id: string;
  sourceKey: string | null;
  orderIndex: number;
  // The stored body, so "same card" can be distinguished from "same slot".
  cardType: string;
  prompt: string | null;
  payload: unknown;
  difficulty: string;
};

export type DeckDiff = {
  /** Same card, same content. `needsWrite` when its position or key must change. */
  unchanged: { id: string; card: GeneratedCard; orderIndex: number; needsWrite: boolean }[];
  /** Same card, different content. */
  updated: { id: string; card: GeneratedCard; orderIndex: number }[];
  /** No stored row claimed this card. */
  created: { card: GeneratedCard; orderIndex: number }[];
  /** No generated card claimed this row — its block is gone. */
  removed: { id: string }[];
};

export type DiffCounts = {
  unchanged: number;
  updated: number;
  created: number;
  removed: number;
};

/** Stable stringification, so JSON column key order never reads as a change. */
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
}

/** The card body a student actually sees. Position is deliberately excluded. */
function bodyOf(card: GeneratedCard): string {
  return canonical({
    cardType: card.cardType,
    prompt: card.prompt,
    payload: card.payload,
    difficulty: card.difficulty,
  });
}

/** The same four fields as they are stored. */
function storedBodyOf(row: ExistingCard): string {
  return canonical({
    cardType: row.cardType,
    prompt: row.prompt,
    payload: row.payload,
    difficulty: row.difficulty,
  });
}

export function diffDeck(
  existing: ExistingCard[],
  generated: GeneratedCard[],
): DeckDiff {
  const diff: DeckDiff = { unchanged: [], updated: [], created: [], removed: [] };

  const claimed = new Set<string>();
  const byKey = new Map<string, ExistingCard>();
  for (const row of existing) {
    if (row.sourceKey !== null) byKey.set(row.sourceKey, row);
  }

  // Pass 1 — match on the source block id. Once a deck has been through one
  // re-sync this is the only pass that does anything.
  const matches = new Map<number, ExistingCard>();
  generated.forEach((card, index) => {
    const row = byKey.get(card.sourceKey);
    if (row && !claimed.has(row.id)) {
      claimed.add(row.id);
      matches.set(index, row);
    }
  });

  // Pass 2 — identical bodies. A card whose text is unchanged is the same card
  // wherever it moved to, so this rescues a deck the generator itself has moved
  // on from: an older generator emitted cards the current one drops, and every
  // survivor shifts a slot. Position matches nothing there; the bodies match.
  // Exact equality only, so a match here can never be a guess.
  const byBody = new Map<string, ExistingCard[]>();
  for (const row of existing) {
    if (claimed.has(row.id)) continue;
    const body = storedBodyOf(row);
    byBody.set(body, [...(byBody.get(body) ?? []), row]);
  }
  generated.forEach((card, index) => {
    if (matches.has(index)) return;
    const queue = byBody.get(bodyOf(card));
    if (!queue) return;
    // Duplicate bodies are possible in a legacy deck; each card takes its own
    // row rather than both landing on the first one.
    const row = queue.shift();
    if (!row) return;
    claimed.add(row.id);
    matches.set(index, row);
  });

  // Pass 3 — legacy rows only. Cards were written in block order, so for a deck
  // predating sourceKey, position *is* the old identity. Runs once per deck:
  // the caller stamps the key, and the next re-sync is pure pass 1.
  const legacy = existing
    .filter((row) => row.sourceKey === null && !claimed.has(row.id))
    .sort((a, b) => a.orderIndex - b.orderIndex);
  let legacyCursor = 0;
  generated.forEach((_, index) => {
    if (matches.has(index)) return;
    const row = legacy[legacyCursor];
    if (!row) return;
    legacyCursor += 1;
    claimed.add(row.id);
    matches.set(index, row);
  });

  generated.forEach((card, index) => {
    const row = matches.get(index);
    if (!row) {
      diff.created.push({ card, orderIndex: index });
      return;
    }
    if (storedBodyOf(row) === bodyOf(card)) {
      diff.unchanged.push({
        id: row.id,
        card,
        orderIndex: index,
        needsWrite: row.orderIndex !== index || row.sourceKey === null,
      });
    } else {
      diff.updated.push({ id: row.id, card, orderIndex: index });
    }
  });

  for (const row of existing) {
    if (!claimed.has(row.id)) diff.removed.push({ id: row.id });
  }

  return diff;
}

export function diffCounts(diff: DeckDiff): DiffCounts {
  return {
    unchanged: diff.unchanged.length,
    updated: diff.updated.length,
    created: diff.created.length,
    removed: diff.removed.length,
  };
}
