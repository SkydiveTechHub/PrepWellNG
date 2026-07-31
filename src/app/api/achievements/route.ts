import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";

const CRITERIA_TYPES = [
  "questions_answered",
  "perfect_score",
  "streak_days",
  "lessons_completed",
  "subject_mastery",
  "mock_score_70",
] as const;

function getTodayRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

// GET /api/achievements — list user achievements
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [allAchievements, earned] = await Promise.all([
      db.achievement.findMany({ orderBy: { criteriaValue: "asc" } }),
      db.studentAchievement.findMany({
        where: { studentId: session.user.id },
        include: { achievement: true },
      }),
    ]);

    const earnedIds = new Set(earned.map((e) => e.achievementId));

    return NextResponse.json({
      achievements: allAchievements.map((a) => ({
        ...a,
        earned: earnedIds.has(a.id),
        earnedAt: earned.find((e) => e.achievementId === a.id)?.earnedAt || null,
      })),
      earned: earned.map((e) => ({
        id: e.id,
        achievementId: e.achievementId,
        achievement: e.achievement,
        earnedAt: e.earnedAt,
      })),
    });
  } catch (error) {
    console.error("Error fetching achievements:", error);
    return NextResponse.json(
      { error: "Failed to fetch achievements" },
      { status: 500 }
    );
  }
}

// POST /api/achievements/check — check and award new achievements
export async function POST() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    const allAchievements = await db.achievement.findMany();
    const earned = await db.studentAchievement.findMany({
      where: { studentId: userId },
      select: { achievementId: true },
    });
    const earnedIds = new Set(earned.map((e) => e.achievementId));
    const newlyEarned: string[] = [];

    for (const achievement of allAchievements) {
      if (earnedIds.has(achievement.id)) continue;

      let shouldAward = false;

      switch (achievement.criteriaType) {
        case "questions_answered": {
          const count = await db.questionResponse.count({
            where: { attempt: { studentId: userId } },
          });
          if (count >= achievement.criteriaValue) shouldAward = true;
          break;
        }
        case "perfect_score": {
          const perfect = await db.assessmentAttempt.findFirst({
            where: {
              studentId: userId,
              status: "COMPLETED",
              percentage: { gte: 100 },
            },
          });
          if (perfect) shouldAward = true;
          break;
        }
        case "streak_days": {
          const recentAttempts = await db.assessmentAttempt.findMany({
            where: { studentId: userId, status: "COMPLETED" },
            select: { completedAt: true },
            orderBy: { completedAt: "desc" },
          });
          if (recentAttempts.length > 0) {
            const dates = [
              ...new Set(
                recentAttempts.map((a) =>
                  a.completedAt
                    ? new Date(a.completedAt).toISOString().slice(0, 10)
                    : ""
                )
              ),
            ].filter(Boolean).sort().reverse();
            let streak = 1;
            for (let i = 1; i < dates.length; i++) {
              const prev = new Date(dates[i - 1]);
              const curr = new Date(dates[i]);
              const diff = (prev.getTime() - curr.getTime()) / (1000 * 60 * 60 * 24);
              if (Math.abs(diff) <= 1.5) streak++;
              else break;
            }
            // Check if the streak includes today
            const today = new Date().toISOString().slice(0, 10);
            const includesToday = dates[0] === today || dates[0] >= today;
            if (streak >= achievement.criteriaValue && includesToday) {
              shouldAward = true;
            }
          }
          break;
        }
        case "lessons_completed": {
          const completed = await db.studentProgress.count({
            where: { studentId: userId, status: "COMPLETED", lessonId: { not: null } },
          });
          if (completed >= achievement.criteriaValue) shouldAward = true;
          break;
        }
        case "subject_mastery": {
          const strongCount = await db.performanceMetric.count({
            where: { studentId: userId, masteryLevel: "STRONG" },
          });
          if (strongCount >= achievement.criteriaValue) shouldAward = true;
          break;
        }
        case "mock_score_70": {
          const highScore = await db.assessmentAttempt.findFirst({
            where: {
              studentId: userId,
              status: "COMPLETED",
              percentage: { gte: 70 },
              assessment: { assessmentType: "MOCK_EXAM" },
            },
          });
          if (highScore) shouldAward = true;
          break;
        }
      }

      if (shouldAward) {
        await db.studentAchievement.create({
          data: { studentId: userId, achievementId: achievement.id },
        });
        newlyEarned.push(achievement.title);
      }
    }

    return NextResponse.json({
      checked: true,
      newlyEarned,
      count: newlyEarned.length,
    });
  } catch (error) {
    console.error("Error checking achievements:", error);
    return NextResponse.json(
      { error: "Failed to check achievements" },
      { status: 500 }
    );
  }
}
