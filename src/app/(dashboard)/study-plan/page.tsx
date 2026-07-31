"use client";

import { useState, useEffect } from "react";
import {
  LuCalendar,
  LuClock,
  LuBookOpen,
  LuTarget,
  LuLoader,
  LuCheck,
  LuChevronLeft,
  LuChevronRight,
  LuTriangleAlert,
  LuSparkles,
} from "react-icons/lu";

type Subject = { id: string; name: string; code: string; slug: string };

type PlanItem = {
  id: string;
  scheduledDate: string;
  subjectId: string;
  activityType: string;
  durationMinutes: number;
  status: string;
  notes: string | null;
  subject: { name: string; code: string; slug: string };
};

type StudyPlan = {
  id: string;
  targetExam: string;
  targetDate: string;
  dailyStudyHours: number;
  items: PlanItem[];
};

const activityColors: Record<string, string> = {
  LESSON: "bg-blue-100 text-blue-700 border-blue-200",
  PRACTICE: "bg-green-100 text-green-700 border-green-200",
  REVISION: "bg-purple-100 text-purple-700 border-purple-200",
  PAST_QUESTIONS: "bg-amber-100 text-amber-700 border-amber-200",
  MOCK_EXAM: "bg-rose-100 text-rose-700 border-rose-200",
};

const activityIcons: Record<string, React.ReactNode> = {
  LESSON: <LuBookOpen className="w-3.5 h-3.5" />,
  PRACTICE: <LuTarget className="w-3.5 h-3.5" />,
  REVISION: <LuLoader className="w-3.5 h-3.5" />,
  PAST_QUESTIONS: <LuClock className="w-3.5 h-3.5" />,
  MOCK_EXAM: <LuSparkles className="w-3.5 h-3.5" />,
};

function groupByWeek(items: PlanItem[]) {
  const weeks: { label: string; days: { date: string; items: PlanItem[] }[] }[] = [];
  const dayMap = new Map<string, PlanItem[]>();

  for (const item of items) {
    const dateKey = item.scheduledDate.slice(0, 10);
    if (!dayMap.has(dateKey)) dayMap.set(dateKey, []);
    dayMap.get(dateKey)!.push(item);
  }

  const sortedDays = [...dayMap.entries()].sort(([a], [b]) => a.localeCompare(b));
  let currentWeek: { date: string; items: PlanItem[] }[] = [];
  let weekStart = "";

  for (const [date, dayItems] of sortedDays) {
    if (!weekStart) weekStart = date;
    const dayNum = parseInt(date.slice(8), 10);
    const weekDay = new Date(date).getDay();

    if (weekDay === 0 && currentWeek.length > 0) {
      weeks.push({
        label: `${weekStart} — ${date}`,
        days: currentWeek,
      });
      currentWeek = [];
      weekStart = date;
    }
    currentWeek.push({ date, items: dayItems });
  }

  if (currentWeek.length > 0) {
    weeks.push({
      label: `${weekStart} — ${sortedDays[sortedDays.length - 1][0]}`,
      days: currentWeek,
    });
  }

  return weeks;
}

export default function StudyPlanPage() {
  const [plan, setPlan] = useState<StudyPlan | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [weeks, setWeeks] = useState<ReturnType<typeof groupByWeek>>([]);
  const [currentWeekIdx, setCurrentWeekIdx] = useState(0);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [targetExam, setTargetExam] = useState<"WAEC" | "JAMB" | "NECO">("JAMB");
  const [targetDate, setTargetDate] = useState("");
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<string[]>([]);
  const [dailyHours, setDailyHours] = useState(2);

  useEffect(() => {
    async function fetchData() {
      try {
        const [planRes, subjectsRes] = await Promise.all([
          fetch("/api/study-plan"),
          fetch("/api/subjects"),
        ]);
        const planData = planRes.ok ? await planRes.json() : { plan: null };
        const subjectsData = await subjectsRes.json();

        setSubjects(subjectsData.subjects || []);

        if (planData.plan) {
          setPlan(planData.plan);
          const grouped = groupByWeek(planData.plan.items);
          setWeeks(grouped);
        } else {
          setShowForm(true);
        }
      } catch {
        setError("Failed to load data.");
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  async function handleGenerate() {
    if (!targetDate || selectedSubjectIds.length === 0) return;
    setGenerating(true);
    setError("");

    try {
      const res = await fetch("/api/study-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetExam,
          targetDate: new Date(targetDate).toISOString(),
          subjectIds: selectedSubjectIds,
          dailyStudyHours: dailyHours,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to generate plan.");
        return;
      }

      const data = await res.json();
      setPlan(data.plan);
      const grouped = groupByWeek(data.plan.items);
      setWeeks(grouped);
      setCurrentWeekIdx(0);
      setShowForm(false);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setGenerating(false);
    }
  }

  function toggleSubject(id: string) {
    setSelectedSubjectIds((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error && !plan) {
    return (
      <div className="max-w-md mx-auto py-20 text-center">
        <LuTriangleAlert className="w-12 h-12 text-amber-500 mx-auto mb-4" />
        <p className="text-sm text-muted">{error}</p>
      </div>
    );
  }

  const currentWeek = weeks[currentWeekIdx];
  const completedItems = plan?.items.filter((i) => i.status === "COMPLETED").length || 0;
  const totalItems = plan?.items.length || 0;

  return (
    <div>
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Study Plan</h1>
            <p className="text-muted mt-1">
              {plan
                ? `${plan.targetExam} · ${Math.ceil(
                    (new Date(plan.targetDate).getTime() - Date.now()) /
                      (1000 * 60 * 60 * 24)
                  )} days remaining`
                : "Your personalized study schedule"}
            </p>
          </div>
          {plan && (
            <button
              onClick={() => setShowForm(true)}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Regenerate
            </button>
          )}
        </div>
      </div>

      {/* Setup form */}
      {showForm && (
        <div className="bg-card rounded-xl border border-border p-6 mb-8">
          <h2 className="text-lg font-semibold text-foreground mb-5">
            {plan ? "Regenerate Study Plan" : "Set Up Your Study Plan"}
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Target Exam
              </label>
              <div className="flex gap-2">
                {(["WAEC", "JAMB", "NECO"] as const).map((exam) => (
                  <button
                    key={exam}
                    onClick={() => setTargetExam(exam)}
                    className={`flex-1 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                      targetExam === exam
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-card text-muted border-border hover:border-primary/30"
                    }`}
                  >
                    {exam}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Exam Date
              </label>
              <input
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Daily Study Hours
              </label>
              <input
                type="number"
                min={0.5}
                max={12}
                step={0.5}
                value={dailyHours}
                onChange={(e) => setDailyHours(parseFloat(e.target.value) || 2)}
                className="w-full px-3 py-2.5 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-foreground mb-2">
              Subjects to Study
            </label>
            <div className="flex flex-wrap gap-2">
              {subjects.map((subject) => (
                <button
                  key={subject.id}
                  onClick={() => toggleSubject(subject.id)}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                    selectedSubjectIds.includes(subject.id)
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-card text-muted border-border hover:border-primary/30"
                  }`}
                >
                  {subject.code || subject.name}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-600 mb-4">{error}</p>
          )}

          <button
            onClick={handleGenerate}
            disabled={generating || !targetDate || selectedSubjectIds.length === 0}
            className="px-6 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {generating ? "Generating..." : plan ? "Regenerate Plan" : "Create Plan"}
          </button>
        </div>
      )}

      {/* Plan view */}
      {plan && currentWeek && (
        <>
          {/* Progress summary */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <div className="bg-card rounded-xl border border-border p-4">
              <p className="text-xs text-muted mb-1">Progress</p>
              <p className="text-2xl font-bold text-foreground">
                {totalItems > 0
                  ? Math.round((completedItems / totalItems) * 100)
                  : 0}
                %
              </p>
              <div className="w-full bg-secondary rounded-full h-1.5 mt-2">
                <div
                  className="bg-primary h-1.5 rounded-full"
                  style={{
                    width: `${
                      totalItems > 0
                        ? (completedItems / totalItems) * 100
                        : 0
                    }%`,
                  }}
                />
              </div>
            </div>
            <div className="bg-card rounded-xl border border-border p-4">
              <p className="text-xs text-muted mb-1">Completed</p>
              <p className="text-2xl font-bold text-green-600">
                {completedItems}
              </p>
              <p className="text-xs text-muted mt-1">
                out of {totalItems} sessions
              </p>
            </div>
            <div className="bg-card rounded-xl border border-border p-4">
              <p className="text-xs text-muted mb-1">Daily Target</p>
              <p className="text-2xl font-bold text-foreground">
                {plan.dailyStudyHours}h
              </p>
              <p className="text-xs text-muted mt-1">per day</p>
            </div>
          </div>

          {/* Week navigation */}
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => setCurrentWeekIdx((p) => Math.max(0, p - 1))}
              disabled={currentWeekIdx === 0}
              className="flex items-center gap-1 text-sm text-muted hover:text-foreground disabled:opacity-30"
            >
              <LuChevronLeft className="w-4 h-4" /> Previous week
            </button>
            <span className="text-sm font-medium text-foreground">
              Week {currentWeekIdx + 1} of {weeks.length}
            </span>
            <button
              onClick={() =>
                setCurrentWeekIdx((p) => Math.min(weeks.length - 1, p + 1))
              }
              disabled={currentWeekIdx === weeks.length - 1}
              className="flex items-center gap-1 text-sm text-muted hover:text-foreground disabled:opacity-30"
            >
              Next week <LuChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Weekly schedule */}
          <div className="space-y-3">
            {currentWeek.days.map((day) => {
              const dateObj = new Date(day.date + "T00:00:00");
              const dayName = dateObj.toLocaleDateString("en-GB", {
                weekday: "short",
              });
              const dateStr = dateObj.toLocaleDateString("en-GB", {
                day: "numeric",
                month: "short",
              });
              const dayCompleted = day.items.filter(
                (i) => i.status === "COMPLETED"
              ).length;

              return (
                <div
                  key={day.date}
                  className="bg-card rounded-xl border border-border p-4"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-muted uppercase">
                        {dayName}
                      </span>
                      <span className="text-xs text-muted">{dateStr}</span>
                    </div>
                    <span className="text-xs text-muted">
                      {dayCompleted}/{day.items.length}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {day.items.map((item) => {
                      const isDone = item.status === "COMPLETED";
                      return (
                        <div
                          key={item.id}
                          className={`flex items-center gap-3 px-3 py-2 rounded-lg border text-sm transition-colors ${
                            isDone
                              ? "bg-green-50 border-green-200"
                              : "bg-secondary/30 border-border"
                          }`}
                        >
                          <span
                            className={`flex-shrink-0 w-7 h-7 rounded-md flex items-center justify-center text-xs ${
                              activityColors[item.activityType] ||
                              "bg-secondary text-muted"
                            }`}
                          >
                            {activityIcons[item.activityType] || (
                              <LuBookOpen className="w-3.5 h-3.5" />
                            )}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-foreground">
                              {item.subject.code} —{" "}
                              {item.activityType.replace(/_/g, " ")}
                            </p>
                          </div>
                          <span className="text-xs text-muted flex-shrink-0">
                            {item.durationMinutes}min
                          </span>
                          {isDone && (
                            <LuCheck className="w-4 h-4 text-green-600 flex-shrink-0" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {plan && !currentWeek && (
        <div className="bg-card rounded-xl border border-border p-8 text-center">
          <LuCalendar className="w-10 h-10 text-muted mx-auto mb-3" />
          <p className="text-sm text-muted">
            No sessions scheduled for this week.
          </p>
        </div>
      )}
    </div>
  );
}
