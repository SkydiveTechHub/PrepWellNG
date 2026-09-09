/** FNV-1a. Small, dependency-free, and stable across Node versions — which
 * `Math.random()` and object key order are not. */
function hash(value: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Choose `count` items deterministically from `items`.
 *
 * Keyed on the page's own identity plus each item's id, so a given page always
 * shows the same questions no matter how often it revalidates or what order
 * the database returned rows in. Ties break on id so the result is total.
 */
export function pickSamples<T extends { id: string }>(
  items: readonly T[],
  count: number,
  seed: string,
): T[] {
  if (count <= 0 || items.length === 0) return [];

  return [...items]
    .map((item) => ({ item, rank: hash(`${seed}:${item.id}`) }))
    .sort((a, b) => a.rank - b.rank || a.item.id.localeCompare(b.item.id))
    .slice(0, count)
    .map(({ item }) => item);
}
