import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getStudentAchievements } from "@/lib/achievements";
import { AchievementsView } from "@/components/achievements/achievements-view";

// Server-rendered. Previously this mounted a spinner and fetched
// /api/achievements from the browser, so the page was always two round-trips
// away from showing anything.
export default async function AchievementsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const achievements = await getStudentAchievements(session.user.id);

  return <AchievementsView achievements={achievements} />;
}
