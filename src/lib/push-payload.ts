// What goes inside an encrypted push message. Pure. The service worker trusts
// none of it (it re-checks the URL), but the server never sends anything that
// would need rejecting.

export const TITLE_MAX = 60;
export const BODY_MAX = 180;
const URL_MAX = 500;
const FALLBACK_URL = "/dashboard";

export type PushPayload = {
  title: string;
  body: string;
  url: string;
  tag: string;
};

/**
 * A same-origin path. "//host" and "/\host" are both treated by browsers as
 * protocol-relative URLs to another origin, so neither is allowed.
 */
export function isInternalPath(url: unknown): url is string {
  if (typeof url !== "string") return false;
  if (url.length === 0 || url.length > URL_MAX) return false;
  return /^\/(?![/\\])[^\s\\]*$/.test(url);
}

export function truncate(text: string, max: number): string {
  const clean = text.trim();
  if (clean.length <= max) return clean;
  return clean.slice(0, max - 1).trimEnd() + "…";
}

export function buildPushPayload(input: {
  title: string;
  body: string;
  url?: string | null;
  tag: string;
}): PushPayload {
  return {
    title: truncate(input.title, TITLE_MAX),
    body: truncate(input.body, BODY_MAX),
    url: isInternalPath(input.url) ? input.url : FALLBACK_URL,
    tag: input.tag,
  };
}

export const pushTag = {
  morning: (dayKey: string) => `morning-${dayKey}`,
  streak: (dayKey: string) => `streak-${dayKey}`,
  announcement: (id: string) => `announcement-${id}`,
};
