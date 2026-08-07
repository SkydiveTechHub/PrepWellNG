export function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "block"
  );
}

/** Mints ids as `<slug>-<n>`, bumping n until the id is unused. */
export function makeIdFactory() {
  const used = new Set<string>();
  return function nextId(slug: string): string {
    let n = 1;
    let id = `${slug}-${n}`;
    while (used.has(id)) {
      n += 1;
      id = `${slug}-${n}`;
    }
    used.add(id);
    return id;
  };
}
