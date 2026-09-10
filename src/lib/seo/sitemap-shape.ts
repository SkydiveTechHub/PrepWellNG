import type { MetadataRoute } from "next";
import { isGatedPath } from "./paths";
import { absoluteUrl } from "./site";

export type SitemapRecord = {
  path: string;
  lastModified?: Date | null;
  changeFrequency?: "daily" | "weekly" | "monthly" | "yearly";
  priority?: number;
};

export function buildSitemap(
  records: readonly SitemapRecord[],
): MetadataRoute.Sitemap {
  const byUrl = new Map<string, SitemapRecord & { url: string }>();

  for (const record of records) {
    // Gated URLs are filtered here rather than at each call site, so a new
    // caller cannot forget.
    if (isGatedPath(`/${record.path.replace(/^\/+/, "")}`)) continue;

    const url = absoluteUrl(record.path);
    const existing = byUrl.get(url);
    if (
      existing &&
      !(record.lastModified && (!existing.lastModified || record.lastModified > existing.lastModified))
    ) {
      continue;
    }
    byUrl.set(url, { ...record, url });
  }

  return [...byUrl.values()].map((record) => ({
    url: record.url,
    // Omitted, not faked, when absent.
    ...(record.lastModified ? { lastModified: record.lastModified } : {}),
    ...(record.changeFrequency ? { changeFrequency: record.changeFrequency } : {}),
    ...(record.priority !== undefined ? { priority: record.priority } : {}),
  }));
}
