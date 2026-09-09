/**
 * The paths an anonymous visitor — and therefore every search-engine crawler
 * and social scraper — may fetch.
 *
 * proxy.ts previously allowlisted exactly one path ("/") by equality, which
 * meant the entire public SEO surface 307-redirected to /login. A crawler
 * cannot tell that apart from the pages not existing.
 *
 * Deliberately narrow: this is the allowlist an auth boundary consults, so
 * every entry here is a route that is meant to be world-readable, and
 * everything absent stays gated. See scripts/test-public-routes.mts, which
 * asserts each gated tree is still closed.
 */
export const PUBLIC_EXACT_PATHS: readonly string[] = [
  "/",
  "/robots.txt",
  "/sitemap.xml",
  "/manifest.webmanifest",
];

export const PUBLIC_PATH_PREFIXES: readonly string[] = [
  "/learn",
  "/past-questions",
];

/** Sitemap shards: /sitemap/<shard>.xml, emitted by generateSitemaps. */
const SITEMAP_SHARD = /^\/sitemap\/[a-z0-9-]+\.xml$/;

/**
 * The ROOT open-graph image only. Images deeper in the tree are already
 * covered by PUBLIC_PATH_PREFIXES, so this pattern is anchored to the root —
 * an unanchored "ends with opengraph-image" rule would make
 * /dashboard/opengraph-image.png public.
 */
const ROOT_OG_IMAGE = /^\/(opengraph-image|twitter-image)(-[A-Za-z0-9]+)?(\.[a-z]+)?$/;

export function isPublicPath(pathname: string): boolean {
  if (!pathname.startsWith("/")) return false;

  // Normalise a trailing slash, but never turn "/" into "".
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;

  if (PUBLIC_EXACT_PATHS.includes(path)) return true;

  // Segment-aware: "/learnable" is not inside "/learn".
  if (
    PUBLIC_PATH_PREFIXES.some(
      (prefix) => path === prefix || path.startsWith(`${prefix}/`),
    )
  ) {
    return true;
  }

  return SITEMAP_SHARD.test(path) || ROOT_OG_IMAGE.test(path);
}
