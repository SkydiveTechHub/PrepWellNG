import { db } from "@/lib/db";
import { STUDENT_PAGE_SIZE, type StudentFilter } from "@/lib/admin-student";
import type { SubscriptionTier } from "@/lib/subscription";
import type { ClassLevel } from "@/lib/curriculum-scope";
import type { Track } from "@/lib/admin-student";

export interface StudentRow {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  classLevel: ClassLevel | null;
  track: Track | null;
  tier: SubscriptionTier;
  isActive: boolean;
  createdAt: Date;
  /** Most recent learning event; null for an account that never studied. */
  lastActiveAt: Date | null;
}

/**
 * `where` is built from an already-normalised filter — normaliseStudentFilter
 * has dropped anything that is not a real enum member, so nothing here can
 * throw on a hand-edited URL.
 */
function whereFor(filter: StudentFilter) {
  return {
    role: "STUDENT" as const,
    ...(filter.classLevel ? { classLevel: filter.classLevel } : {}),
    ...(filter.track ? { track: filter.track } : {}),
    ...(filter.tier ? { tier: filter.tier } : {}),
    ...(filter.status ? { isActive: filter.status === "active" } : {}),
    ...(filter.search
      ? {
          OR: [
            { firstName: { contains: filter.search, mode: "insensitive" as const } },
            { lastName: { contains: filter.search, mode: "insensitive" as const } },
            { email: { contains: filter.search, mode: "insensitive" as const } },
            { phone: { contains: filter.search } },
          ],
        }
      : {}),
  };
}

export async function listStudents(
  filter: StudentFilter,
): Promise<{ rows: StudentRow[]; total: number }> {
  const where = whereFor(filter);

  // Counted FIRST, not in parallel with the fetch: the row query has to skip by
  // a page number that is already clamped to the real page count, or ?page=999
  // skips past the end and renders "no matches" over a full result set. One
  // extra round trip is the price of the page being correct.
  const total = await db.user.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / STUDENT_PAGE_SIZE));
  const page = Math.min(Math.max(1, filter.page), totalPages);

  const users = await db.user.findMany({
    where,
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      classLevel: true,
      track: true,
      tier: true,
      isActive: true,
      createdAt: true,
      learningEvents: {
        select: { occurredAt: true },
        orderBy: { occurredAt: "desc" },
        take: 1,
      },
    },
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * STUDENT_PAGE_SIZE,
    take: STUDENT_PAGE_SIZE,
  });

  return {
    total,
    rows: users.map((user) => ({
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phone,
      classLevel: user.classLevel as ClassLevel | null,
      track: user.track as Track | null,
      tier: user.tier as SubscriptionTier,
      isActive: user.isActive,
      createdAt: user.createdAt,
      lastActiveAt: user.learningEvents[0]?.occurredAt ?? null,
    })),
  };
}
