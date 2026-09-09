/**
 * Every route prefix that must never appear in a sitemap or be crawled.
 *
 * One list, two consumers (robots.ts and the sitemap), because the failure
 * mode of two lists is a gated URL leaking into the sitemap months later.
 */
export const GATED_PATH_PREFIXES: readonly string[] = [
  "/api",
  "/admin",
  "/dashboard",
  "/classroom",
  "/practice",
  "/flashcards",
  "/performance",
  "/study-plan",
  "/achievements",
  "/library",
  "/settings",
  "/login",
  "/register",
];

/**
 * Sitemap shards. Defined here rather than in sitemap-shape.ts because
 * robots.ts must name one sitemap URL per shard, and robots.ts is built before
 * the sitemap module exists.
 */
export const SITEMAP_SHARDS = ["static", "learn", "past-questions"] as const;
export type SitemapShard = (typeof SITEMAP_SHARDS)[number];

/** Segment-aware: "/librarian" is not inside "/library". */
export function isGatedPath(path: string): boolean {
  const normalised = path.replace(/\/+$/, "") || "/";
  return GATED_PATH_PREFIXES.some(
    (prefix) => normalised === prefix || normalised.startsWith(`${prefix}/`),
  );
}
