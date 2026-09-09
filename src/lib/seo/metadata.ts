import type { Metadata } from "next";
import { absoluteUrl, siteName } from "./site";

export type SeoInput = {
  title: string;
  description: string;
  /** Site-relative path, e.g. "/learn/biology". */
  path: string;
  /** Site-relative or absolute image URL. Falls back to the route's own OG image. */
  image?: string;
  noindex?: boolean;
};

/**
 * The one place canonical, Open Graph and Twitter tags are derived, so the
 * three cannot disagree — the failure mode where a page's canonical says one
 * URL and its og:url says another is both common and silently damaging.
 */
export function buildMetadata({
  title,
  description,
  path,
  image,
  noindex,
}: SeoInput): Metadata {
  const url = absoluteUrl(path);
  const images = image ? [{ url: absoluteUrl(image) }] : undefined;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      url,
      title,
      description,
      siteName,
      locale: "en_NG",
      ...(images ? { images } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      ...(images ? { images: images.map((i) => i.url) } : {}),
    },
    ...(noindex ? { robots: { index: false, follow: false } } : {}),
  };
}

/**
 * For gated layouts. robots.txt Disallow stops crawling but does not remove a
 * URL already in the index; this directive does.
 */
export const NOINDEX: Metadata = { robots: { index: false, follow: false } };
