import { db } from "@/lib/db";
import { STUDENT_PAGE_SIZE, type StudentFilter } from "@/lib/admin-student";
import type { SubscriptionTier } from "@/lib/subscription";
import type { ClassLevel } from "@/lib/curriculum-scope";
import type { Track } from "@/lib/admin-student";
import type { StudentProfileInput } from "@/lib/validators";

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

export interface StudentDetail extends StudentRow {
  state: string | null;
  schoolId: string | null;
  schoolName: string | null;
  suspendedAt: Date | null;
  suspendedReason: string | null;
  tierUpdatedAt: Date | null;
  attemptCount: number;
  masteredTopicCount: number;
  flashcardReviewCount: number;
}

export async function getStudentDetail(id: string): Promise<StudentDetail | null> {
  const user = await db.user.findFirst({
    where: { id, role: "STUDENT" },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      classLevel: true,
      track: true,
      state: true,
      schoolId: true,
      school: { select: { name: true } },
      tier: true,
      tierUpdatedAt: true,
      isActive: true,
      suspendedAt: true,
      suspendedReason: true,
      createdAt: true,
      learningEvents: {
        select: { occurredAt: true },
        orderBy: { occurredAt: "desc" },
        take: 1,
      },
      _count: {
        select: {
          attempts: true,
          topicMastery: true,
          flashcardReviews: true,
        },
      },
    },
  });

  if (!user) return null;

  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    phone: user.phone,
    classLevel: user.classLevel as ClassLevel | null,
    track: user.track as Track | null,
    state: user.state,
    schoolId: user.schoolId,
    schoolName: user.school?.name ?? null,
    tier: user.tier as SubscriptionTier,
    tierUpdatedAt: user.tierUpdatedAt,
    isActive: user.isActive,
    suspendedAt: user.suspendedAt,
    suspendedReason: user.suspendedReason,
    createdAt: user.createdAt,
    lastActiveAt: user.learningEvents[0]?.occurredAt ?? null,
    attemptCount: user._count.attempts,
    masteredTopicCount: user._count.topicMastery,
    flashcardReviewCount: user._count.flashcardReviews,
  };
}

/**
 * What deleting this account would destroy, per relation.
 *
 * Following /admin/api/questions/[id]/usage: an admin about to delete is shown
 * the actual counts, not a generic warning.
 */
export async function getStudentDeletionImpact(
  id: string,
): Promise<Record<string, number>> {
  const [attempts, responses, progress, mastery, events, reviews, decks] =
    await Promise.all([
      db.assessmentAttempt.count({ where: { studentId: id } }),
      db.questionResponse.count({ where: { attempt: { studentId: id } } }),
      db.studentProgress.count({ where: { studentId: id } }),
      db.topicMastery.count({ where: { studentId: id } }),
      db.learningEvent.count({ where: { studentId: id } }),
      db.flashcardReview.count({ where: { studentId: id } }),
      db.flashcardDeck.count({ where: { createdBy: id } }),
    ]);

  return {
    "Assessment attempts": attempts,
    "Question responses": responses,
    "Progress records": progress,
    "Topic mastery records": mastery,
    "Learning events": events,
    "Flashcard reviews": reviews,
    "Authored flashcard decks": decks,
  };
}

export async function updateStudentProfile(
  id: string,
  data: StudentProfileInput,
): Promise<void> {
  await db.user.update({ where: { id }, data });
}

export async function setStudentTier(
  id: string,
  tier: SubscriptionTier,
): Promise<void> {
  await db.user.update({
    where: { id },
    data: { tier, tierUpdatedAt: new Date() },
  });
}

export async function setStudentActive(
  id: string,
  isActive: boolean,
  reason: string | null,
): Promise<void> {
  await db.user.update({
    where: { id },
    data: isActive
      ? { isActive: true, suspendedAt: null, suspendedReason: null }
      : { isActive: false, suspendedAt: new Date(), suspendedReason: reason },
  });
}

/**
 * Stamps the revocation instant. Every token issued at or before it is rejected
 * on the next profile refresh — see isSessionRevoked in account-status.ts.
 *
 * This is not a password reset: the account keeps its password and the student
 * simply signs in again. Real password reset needs a reset-token model and an
 * email subsystem, neither of which exists yet.
 */
export async function revokeStudentSessions(id: string): Promise<void> {
  await db.user.update({
    where: { id },
    data: { sessionsValidFrom: new Date() },
  });
}

export async function deleteStudent(id: string): Promise<void> {
  await db.user.delete({ where: { id } });
}
