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
} from "react-icons/lu";

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
  questions_answered: <LuBookOpen className="w-6 h-6" />,
  perfect_score: <LuStar className="w-6 h-6" />,
  streak_days: <LuFlame className="w-6 h-6" />,
  lessons_completed: <LuGraduationCap className="w-6 h-6" />,
  subject_mastery: <LuTrophy className="w-6 h-6" />,
  mock_score_70: <LuAward className="w-6 h-6" />,
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-md mx-auto py-20 text-center">
        <LuTriangleAlert className="w-12 h-12 text-amber-500 mx-auto mb-4" />
        <p className="text-sm text-muted">{error}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">Achievements</h1>
        <p className="text-muted mt-1">
          {earnedCount} of {achievements.length} achievements earned
        </p>
      </div>

      {achievements.length === 0 ? (
        <div className="bg-card rounded-xl border border-border p-8 text-center">
          <LuAward className="w-12 h-12 text-muted mx-auto mb-4" />
          <p className="text-muted text-sm">No achievements available yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {achievements.map((achievement) => (
            <div
              key={achievement.id}
              className={`rounded-xl border p-5 transition-all ${
                achievement.earned
                  ? "bg-card border-border"
                  : "bg-card/50 border-border/50 opacity-60"
              }`}
            >
              <div className="flex items-start gap-4">
                <div
                  className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    CRITERIA_COLORS[achievement.criteriaType] ||
                    "bg-secondary text-muted"
                  }`}
                >
                  {CRITERIA_ICONS[achievement.criteriaType] || (
                    <LuAward className="w-6 h-6" />
                  )}
                </div>
                <div className="min-w-0">
                  <h3
                    className={`font-semibold text-sm ${
                      achievement.earned
                        ? "text-foreground"
                        : "text-muted"
                    }`}
                  >
                    {achievement.title}
                  </h3>
                  <p className="text-xs text-muted mt-0.5 leading-relaxed">
                    {achievement.description}
                  </p>
                  {achievement.earned && achievement.earnedAt && (
                    <p className="text-[11px] text-primary mt-1.5 font-medium">
                      Earned{" "}
                      {new Date(achievement.earnedAt).toLocaleDateString(
                        "en-GB",
                        {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        }
                      )}
                    </p>
                  )}
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <div
                  className={`h-1.5 flex-1 rounded-full ${
                    achievement.earned ? "bg-primary/20" : "bg-secondary"
                  }`}
                >
                  <div
                    className={`h-1.5 rounded-full ${
                      achievement.earned ? "bg-primary" : "bg-border"
                    }`}
                    style={{
                      width: achievement.earned ? "100%" : "0%",
                    }}
                  />
                </div>
                <span
                  className={`text-xs font-medium ${
                    achievement.earned ? "text-primary" : "text-muted"
                  }`}
                >
                  {achievement.earned ? "Done" : "Locked"}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
