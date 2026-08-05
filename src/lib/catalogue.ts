import { unstable_cache } from "next/cache";
import { db } from "@/lib/db";

// Curriculum catalogue reads.
//
// These are identical for every student and only change when an admin authors
// content, yet they were re-queried on every request behind `force-dynamic`.
//
// `unstable_cache` rather than the `use cache` directive: the latter requires
// the `cacheComponents` flag, which changes the rendering model across the
// whole app and is not something to switch on as a side effect of a perf pass.
//
// Call `revalidateTag("catalogue")` after any admin write that adds or edits a
// subject or topic.
export const CATALOGUE_TAG = "catalogue";

/** Every subject with its topic and question counts. */
export const getSubjectCatalogue = unstable_cache(
  async () =>
    db.subject.findMany({
      orderBy: [{ trackCategory: "asc" }, { name: "asc" }],
      include: {
        _count: { select: { topics: true, questions: true } },
      },
    }),
  ["subject-catalogue"],
  { revalidate: 3600, tags: [CATALOGUE_TAG] },
);

/**
 * Filtered views are derived in memory from the one cached list rather than
 * cached per filter combination — the whole catalogue is a few dozen rows, and
 * separate entries per (track x examType) would mostly be cache misses.
 */
export async function getSubjects(filter?: {
  track?: string | null;
  examType?: string | null;
}) {
  const all = await getSubjectCatalogue();
  if (!filter?.track && !filter?.examType) return all;

  return all.filter((subject) => {
    if (filter.track && subject.trackCategory !== filter.track) return false;
    switch (filter.examType) {
      case "waec":
        return subject.isWaec;
      case "jamb":
        return subject.isJamb;
      case "neco":
        return subject.isNeco;
      default:
        return true;
    }
  });
}
