/**
 * The canonical host every public URL is built from.
 *
 * Read from NEXT_PUBLIC_APP_URL (already used by the Paystack lib) so preview
 * deployments canonicalise to themselves instead of to production. Anything
 * unparseable, or parseable but not http(s), falls back rather than throwing
 * or propagating: a build that dies — or ships a `javascript:`/`file:`/`data:`
 * canonical — because an env var was fat-fingered is worse than one that ships
 * a slightly wrong but valid canonical.
 */
const FALLBACK_SITE_URL = "https://prepwell.ng";
const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

export function normaliseSiteUrl(raw: string | null | undefined): string {
  const candidate = raw?.trim();
  if (!candidate) return FALLBACK_SITE_URL;
  try {
    const parsed = new URL(candidate);
    if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) return FALLBACK_SITE_URL;
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return FALLBACK_SITE_URL;
  }
}

export const siteUrl = normaliseSiteUrl(process.env.NEXT_PUBLIC_APP_URL);
export const siteName = "PrepWell NG";
export const siteDescription =
  "Nigeria's learning platform for WAEC, JAMB and NECO. Structured lessons, past questions with worked answers, mock exams and a study plan that adapts to you.";

/**
 * Absolute URL for a site-relative path. Already-absolute inputs pass through,
 * so callers can hand this a CDN image URL without special-casing.
 */
export function absoluteUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;

  const trimmed = path.trim().replace(/^\/+/, "").replace(/\/+$/, "");
  return trimmed ? `${siteUrl}/${trimmed}` : `${siteUrl}/`;
}
