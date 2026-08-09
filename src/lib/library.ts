import { db } from "./db";
import { relevantTrackCategories } from "./subjects";

export type LibrarySubject = {
  id: string;
  name: string;
  slug: string;
  code: string;
  description: string;
  trackCategory: string;
  _count: { resources: number };
};

/**
 * The student's shelf: every subject in a track category relevant to them,
 * with its resource count.
 */
export async function getLibraryShelf(userId: string): Promise<LibrarySubject[]> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { track: true },
  });

  return db.subject.findMany({
    where: { trackCategory: { in: [...relevantTrackCategories(user?.track)] } },
    orderBy: [{ trackCategory: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      slug: true,
      code: true,
      description: true,
      trackCategory: true,
      _count: { select: { resources: true } },
    },
  });
}

/** Every resource filed under one subject, in shelf order. */
export function getSubjectResources(subjectId: string) {
  return db.subjectResource.findMany({
    where: { subjectId },
    orderBy: [{ orderIndex: "asc" }, { title: "asc" }],
  });
}

/**
 * Shelf lookup that tolerates a failed track read: if the user row cannot be
 * fetched, fall back to showing everything rather than erroring out.
 */
export async function getLibraryShelfTolerant(
  userId: string,
): Promise<LibrarySubject[]> {
  let track: string | null = null;
  try {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { track: true },
    });
    track = user?.track ?? null;
  } catch (error) {
    console.error("Library track lookup error:", error);
  }

  return db.subject.findMany({
    where: { trackCategory: { in: [...relevantTrackCategories(track)] } },
    orderBy: [{ trackCategory: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      slug: true,
      code: true,
      description: true,
      trackCategory: true,
      _count: { select: { resources: true } },
    },
  });
}
