import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getAchievementCatalogue } from "@/lib/achievements";
import {
  AchievementsView,
  type Achievement,
} from "@/components/achievements/achievements-view";

// Server-rendered. Previously this mounted a spinner and fetched
// /api/achievements from the browser, so the page was always two round-trips
// away from showing anything.
export default async function AchievementsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  // The catalogue is identical for every student and changes only when content
  // is authored, so it is cached; only the earned set is per-request.
  const [catalogue, earned] = await Promise.all([
    getAchievementCatalogue(),
    db.studentAchievement.findMany({
      where: { studentId: session.user.id },
      select: { achievementId: true, earnedAt: true },
    }),
  ]);

  const earnedAtById = new Map(earned.map((e) => [e.achievementId, e.earnedAt]));

  const achievements: Achievement[] = catalogue.map((a) => ({
    ...a,
    earned: earnedAtById.has(a.id),
    earnedAt: earnedAtById.get(a.id)?.toISOString() ?? null,
  }));

  return <AchievementsView achievements={achievements} />;
}
