import { unstable_cache } from "next/cache";
import { db } from "@/lib/db";
import { currentStreak, lagosDayKey } from "@/lib/streak";

/**
 * The achievement catalogue is the same for every student and only changes when
 * content is authored, so it is cached rather than re-read per request.
 *
 * `unstable_cache` (rather than `use cache`) because the latter requires the
 * `cacheComponents` flag, which changes the rendering model app-wide.
 */
export const getAchievementCatalogue = unstable_cache(
  async () =>
    db.achievement.findMany({
      orderBy: { criteriaValue: "asc" },
      select: {
        id: true,
        title: true,
        description: true,
        iconUrl: true,
        criteriaType: true,
        criteriaValue: true,
      },
    }),
  ["achievement-catalogue"],
  { revalidate: 3600, tags: ["achievements"] },
);

export type StudentAchievement = {
  id: string;
  title: string;
  description: string;
  iconUrl: string | null;
  criteriaType: string;
  criteriaValue: number;
  earned: boolean;
  /** ISO timestamp, or null when not yet earned. */
  earnedAt: string | null;
};

/**
 * The catalogue with the student's earned set folded in. The catalogue half is
 * shared and cached; only the earned lookup is per-request.
 */
export async function getStudentAchievements(
  studentId: string,
): Promise<StudentAchievement[]> {
  const [catalogue, earned] = await Promise.all([
    getAchievementCatalogue(),
    db.studentAchievement.findMany({
      where: { studentId },
      select: { achievementId: true, earnedAt: true },
    }),
  ]);

  const earnedAtById = new Map(earned.map((e) => [e.achievementId, e.earnedAt]));

  return catalogue.map((a) => ({
    ...a,
    earned: earnedAtById.has(a.id),
    earnedAt: earnedAtById.get(a.id)?.toISOString() ?? null,
  }));
}

/**
 * The full achievement rows plus the student's earned records, as
 * `GET /api/achievements` returns them. Distinct from
 * `getStudentAchievements`, which serves the page and returns only the
 * catalogue fields the UI renders.
 */
export async function getAchievementsApiPayload(studentId: string) {
  const [allAchievements, earned] = await Promise.all([
    db.achievement.findMany({ orderBy: { criteriaValue: "asc" } }),
    db.studentAchievement.findMany({
      where: { studentId },
      include: { achievement: true },
    }),
  ]);

  const earnedAtById = new Map(earned.map((e) => [e.achievementId, e.earnedAt]));

  return {
    achievements: allAchievements.map((a) => ({
      ...a,
      earned: earnedAtById.has(a.id),
      earnedAt: earnedAtById.get(a.id) ?? null,
    })),
    earned: earned.map((e) => ({
      id: e.id,
      achievementId: e.achievementId,
      achievement: e.achievement,
      earnedAt: e.earnedAt,
    })),
  };
}

// Achievement awarding — one implementation.
//
// This logic previously existed twice: inline in the assessment submit route and
// again in POST /api/achievements. Both copies computed streaks in UTC, which
// mis-dates every session a Nigerian student runs between midnight and 1am.

type CriteriaType =
  | "questions_answered"
  | "perfect_score"
  | "streak_days"
  | "lessons_completed"
  | "subject_mastery"
  | "mock_score_70";

/**
 * Awards every newly-qualifying achievement and returns their titles.
 *
 * Each metric is computed at most once for the whole batch. The old version
 * re-queried inside the per-achievement loop, so a student with five unearned
 * "questions answered" tiers paid for five identical counts on every submission.
 */
export async function awardAchievements(studentId: string): Promise<string[]> {
  const [allAchievements, earned] = await Promise.all([
    db.achievement.findMany({
      select: { id: true, title: true, criteriaType: true, criteriaValue: true },
    }),
    db.studentAchievement.findMany({
      where: { studentId },
      select: { achievementId: true },
    }),
  ]);

  const earnedIds = new Set(earned.map((e) => e.achievementId));
  const pending = allAchievements.filter((a) => !earnedIds.has(a.id));
  if (pending.length === 0) return [];

  const needed = new Set(pending.map((a) => a.criteriaType as CriteriaType));

  // Only pay for the metrics the outstanding achievements actually need.
  const [
    questionsAnswered,
    hasPerfect,
    streakDays,
    lessonsCompleted,
    strongSubjects,
    hasMock70,
  ] = await Promise.all([
    needed.has("questions_answered")
      ? db.questionResponse.count({ where: { attempt: { studentId } } })
      : Promise.resolve(0),
    needed.has("perfect_score")
      ? db.assessmentAttempt
          .findFirst({
            where: { studentId, status: "COMPLETED", percentage: { gte: 100 } },
            select: { id: true },
          })
          .then(Boolean)
      : Promise.resolve(false),
    needed.has("streak_days")
      ? db.assessmentAttempt
          .findMany({
            where: { studentId, status: "COMPLETED", completedAt: { not: null } },
            select: { completedAt: true },
            orderBy: { completedAt: "desc" },
            // A streak can't reach further back than the rows we read, and no
            // achievement asks for anything near a year.
            take: 400,
          })
          .then((rows) =>
            currentStreak(
              rows.map((row) => lagosDayKey(row.completedAt!)),
              lagosDayKey(new Date()),
            ),
          )
      : Promise.resolve(0),
    needed.has("lessons_completed")
      ? db.studentProgress.count({
          where: { studentId, status: "COMPLETED", lessonId: { not: null } },
        })
      : Promise.resolve(0),
    needed.has("subject_mastery")
      ? db.performanceMetric.count({
          where: { studentId, masteryLevel: "STRONG" },
        })
      : Promise.resolve(0),
    needed.has("mock_score_70")
      ? db.assessmentAttempt
          .findFirst({
            where: {
              studentId,
              status: "COMPLETED",
              percentage: { gte: 70 },
              assessment: { assessmentType: "MOCK_EXAM" },
            },
            select: { id: true },
          })
          .then(Boolean)
      : Promise.resolve(false),
  ]);

  const qualifies = pending.filter((achievement) => {
    switch (achievement.criteriaType as CriteriaType) {
      case "questions_answered":
        return questionsAnswered >= achievement.criteriaValue;
      case "perfect_score":
        return hasPerfect;
      case "streak_days":
        return streakDays >= achievement.criteriaValue;
      case "lessons_completed":
        return lessonsCompleted >= achievement.criteriaValue;
      case "subject_mastery":
        return strongSubjects >= achievement.criteriaValue;
      case "mock_score_70":
        return hasMock70;
      default:
        return false;
    }
  });

  if (qualifies.length === 0) return [];

  // `skipDuplicates` makes concurrent submissions safe against the
  // (studentId, achievementId) unique index.
  await db.studentAchievement.createMany({
    data: qualifies.map((a) => ({ studentId, achievementId: a.id })),
    skipDuplicates: true,
  });

  return qualifies.map((a) => a.title);
}
