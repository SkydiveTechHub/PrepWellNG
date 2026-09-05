import type { ProviderFilter } from "./types";

/**
 * The ledger's identity for a filter.
 *
 * Stored in ProviderFetch.cacheKey under a unique constraint, so it is both
 * the coverage record and the in-flight lock — two requests for the same paper
 * cannot both call the provider. Normalisation matters: " Chemistry " and
 * "chemistry" must not buy two fetches of the same paper.
 */
export function cacheKey(filter: ProviderFilter): string {
  const subject = filter.subjectSlug.trim().toLowerCase().replaceAll("|", "%7C");
  return `${subject}|${filter.examType}|${filter.examYear}`;
}
