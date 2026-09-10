import type { MetadataRoute } from "next";
import { notFound } from "next/navigation";
import { loadEligibleTopicParams, loadPublishableSubjects } from "@/lib/seo/learn-data";
import { loadEligiblePaperParams } from "@/lib/seo/paper-data";
import { SITEMAP_SHARDS, type SitemapShard } from "@/lib/seo/paths";
import { buildSitemap, type SitemapRecord } from "@/lib/seo/sitemap-shape";

export const revalidate = 86400;

export function generateSitemaps() {
  return SITEMAP_SHARDS.map((id) => ({ id }));
}

async function recordsFor(shard: SitemapShard): Promise<SitemapRecord[]> {
  if (shard === "static") {
    return [
      { path: "/", changeFrequency: "weekly", priority: 1 },
      { path: "/learn", changeFrequency: "weekly", priority: 0.8 },
      { path: "/past-questions", changeFrequency: "weekly", priority: 0.8 },
    ];
  }

  if (shard === "learn") {
    // loadPublishableSubjects, not loadPublicSubjects: of the 44 subjects in
    // the database only those with at least one eligible topic get a hub
    // page (see (public)/learn/[subjectSlug]/page.tsx, which notFound()s
    // otherwise). Using the unfiltered subject list here would advertise
    // hub pages that 404.
    const [subjects, topics] = await Promise.all([
      loadPublishableSubjects(),
      loadEligibleTopicParams(),
    ]);
    return [
      ...subjects.map((subject) => ({
        path: `/learn/${subject.slug}`,
        changeFrequency: "monthly" as const,
        priority: 0.7,
      })),
      ...topics.map((topic) => ({
        path: `/learn/${topic.subjectSlug}/${topic.topicSlug}`,
        lastModified: topic.lastModified,
        changeFrequency: "monthly" as const,
        priority: 0.6,
      })),
    ];
  }

  const papers = await loadEligiblePaperParams();
  const branches = new Set<string>();
  for (const paper of papers) {
    branches.add(`/past-questions/${paper.examSegment}`);
    branches.add(`/past-questions/${paper.examSegment}/${paper.subjectSlug}`);
  }

  return [
    ...[...branches].map((path) => ({
      path,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
    ...papers.map((paper) => ({
      path: `/past-questions/${paper.examSegment}/${paper.subjectSlug}/${paper.year}`,
      lastModified: paper.lastModified,
      changeFrequency: "yearly" as const,
      priority: 0.6,
    })),
  ];
}

function isShard(value: string): value is SitemapShard {
  return (SITEMAP_SHARDS as readonly string[]).includes(value);
}

/**
 * As of Next.js 16 the id from generateSitemaps arrives as a promise resolving
 * to a string — see
 * node_modules/next/dist/docs/01-app/03-api-reference/04-functions/generate-sitemaps.md
 * ("v16.0.0: The id values returned from generateSitemaps are now passed as a
 * promise that resolves to a string"). Destructuring it as a plain value, or
 * casting it to the shard union without checking, is wrong.
 */
export default async function sitemap(props: {
  id: Promise<string>;
}): Promise<MetadataRoute.Sitemap> {
  const id = await props.id;
  if (!isShard(id)) notFound();

  return buildSitemap(await recordsFor(id));
}
