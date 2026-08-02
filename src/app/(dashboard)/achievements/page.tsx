"use client";

import { useState, useEffect } from "react";
import {
  LuAward,
  LuBookOpen,
  LuStar,
  LuFlame,
  LuGraduationCap,
  LuTrophy,
  LuTriangleAlert,
  LuLock,
} from "react-icons/lu";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

type Achievement = {
  id: string;
  title: string;
  description: string;
  iconUrl: string | null;
  criteriaType: string;
  criteriaValue: number;
  earned: boolean;
  earnedAt: string | null;
};

const CRITERIA_ICONS: Record<string, React.ReactNode> = {
  questions_answered: <LuBookOpen className="h-6 w-6" />,
  perfect_score: <LuStar className="h-6 w-6" />,
  streak_days: <LuFlame className="h-6 w-6" />,
  lessons_completed: <LuGraduationCap className="h-6 w-6" />,
  subject_mastery: <LuTrophy className="h-6 w-6" />,
  mock_score_70: <LuAward className="h-6 w-6" />,
};

const CRITERIA_COLORS: Record<string, string> = {
  questions_answered: "bg-blue-100 text-blue-600",
  perfect_score: "bg-yellow-100 text-yellow-600",
  streak_days: "bg-orange-100 text-orange-600",
  lessons_completed: "bg-purple-100 text-purple-600",
  subject_mastery: "bg-emerald-100 text-emerald-600",
  mock_score_70: "bg-rose-100 text-rose-600",
};

export default function AchievementsPage() {
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetchAchievements() {
      try {
        const res = await fetch("/api/achievements");
        if (!res.ok) throw new Error("Failed to load");
        const data = await res.json();
        setAchievements(data.achievements || []);
      } catch {
        setError("Could not load achievements.");
      } finally {
        setLoading(false);
      }
    }
    fetchAchievements();
  }, []);

  const earnedCount = achievements.filter((a) => a.earned).length;
  const progress = achievements.length > 0 ? Math.round((earnedCount / achievements.length) * 100) : 0;

  if (loading) {
    return <Spinner label="Loading achievements..." />;
  }

  if (error) {
    return (
      <EmptyState
        tone="primary"
        icon={<LuTriangleAlert className="h-6 w-6" />}
        title="Couldn't load achievements"
        description={error}
      />
    );
  }

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Achievements"
        description={
          achievements.length > 0
            ? `${earnedCount} of ${achievements.length} achievements earned`
            : "Rewards for your effort"
        }
      />

      {achievements.length > 0 && (
        <div className="card mb-8 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-warning-soft text-warning">
                <LuAward className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-bold text-foreground">Collection progress</p>
                <p className="text-xs text-muted">
                  {earnedCount === 0
                    ? "Complete activities to earn your first badge"
                    : `Keep going, ${achievements.length - earnedCount} badge${
                        achievements.length - earnedCount === 1 ? "" : "s"
                      } to go`}
                </p>
              </div>
            </div>
            <span className="text-sm font-bold text-foreground">{progress}%</span>
          </div>
          <Progress value={progress} tone={progress === 100 ? "success" : "auto"} className="mt-3 h-2.5" />
        </div>
      )}

      {achievements.length === 0 ? (
        <EmptyState
          icon={<LuAward className="h-6 w-6" />}
          title="No achievements available yet"
          description="Check back soon — new challenges are on the way."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {achievements.map((achievement) => (
            <div
              key={achievement.id}
              className={cn(
                "card p-5 transition-all",
                achievement.earned
                  ? "shadow-card"
                  : "border-dashed opacity-70 grayscale-[0.3]",
              )}
            >
              <div className="flex items-start gap-4">
                <span
                  className={cn(
                    "flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl",
                    achievement.earned
                      ? CRITERIA_COLORS[achievement.criteriaType] || "bg-secondary text-muted"
                      : "bg-secondary text-muted",
                  )}
                >
                  {achievement.earned
                    ? CRITERIA_ICONS[achievement.criteriaType] || <LuAward className="h-6 w-6" />
                    : <LuLock className="h-5 w-5" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3
                      className={cn(
                        "truncate text-sm font-bold",
                        achievement.earned ? "text-foreground" : "text-muted",
                      )}
                    >
                      {achievement.title}
                    </h3>
                  </div>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted">
                    {achievement.description}
                  </p>
                  {achievement.earned && achievement.earnedAt && (
                    <Badge variant="primary" className="mt-2">
                      Earned{" "}
                      {new Date(achievement.earnedAt).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
