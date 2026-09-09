import type { MetadataRoute } from "next";
import { GATED_PATH_PREFIXES, SITEMAP_SHARDS } from "@/lib/seo/paths";
import { absoluteUrl } from "@/lib/seo/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Bare prefixes, no trailing slash: robots.txt matching is prefix-based,
      // so "/login/" would leave "/login" itself crawlable while "/login"
      // covers both it and its subtree. Disallow only stops crawling — the
      // noindex directives on the gated layouts are what keep these out of
      // the index.
      disallow: [...GATED_PATH_PREFIXES],
    },
    // generateSitemaps emits /sitemap/<id>.xml per shard and no index file, so
    // every shard is named here. The field accepts string[].
    sitemap: SITEMAP_SHARDS.map((shard) => absoluteUrl(`/sitemap/${shard}.xml`)),
  };
}
