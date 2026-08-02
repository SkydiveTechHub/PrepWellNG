"use client";

import { useState, useEffect } from "react";
import {
  LuCalendar,
  LuBookOpen,
  LuTarget,
  LuCheck,
  LuChevronLeft,
  LuChevronRight,
  LuTriangleAlert,
  LuSparkles,
  LuPlus,
} from "react-icons/lu";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Spinner } from "@/components/ui/spinner";
import { buttonClass } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
  runwayStart?: string;
  items: PlanItem[];
};

const activityBadge: Record<string, "blue" | "green" | "purple" | "amber" | "red"> = {
  LESSON: "blue",
  PRACTICE: "green",
  REVISION: "purple",
  PAST_QUESTIONS: "amber",
  MOCK_EXAM: "red",
};

const activityIcons: Record<string, React.ReactNode> = {
  LESSON: <LuBookOpen className="h-3.5 w-3.5" />,
  PRACTICE: <LuTarget className="h-3.5 w-3.5" />,
  REVISION: <LuSparkles className="h-3.5 w-3.5" />,
  PAST_QUESTIONS: <LuCalendar className="h-3.5 w-3.5" />,
  MOCK_EXAM: <LuSparkles className="h-3.5 w-3.5" />,
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
  const [daysRemaining, setDaysRemaining] = useState<number | null>(null);

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
          setDaysRemaining(
            Math.ceil(
              (new Date(planData.plan.targetDate).getTime() - Date.now()) /
                (1000 * 60 * 60 * 24)
            )
          );
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
      setDaysRemaining(
        Math.ceil(
          (new Date(data.plan.targetDate).getTime() - Date.now()) /
            (1000 * 60 * 60 * 24)
        )
      );
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
    return <Spinner label="Loading your study plan..." />;
  }

  if (error && !plan) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <LuTriangleAlert className="mx-auto mb-4 h-12 w-12 text-amber-500" />
        <p className="text-sm text-muted">{error}</p>
      </div>
    );
  }

  const currentWeek = weeks[currentWeekIdx];
  const completedItems = plan?.items.filter((i) => i.status === "COMPLETED").length || 0;
  const totalItems = plan?.items.length || 0;
  const progress = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Study Plan"
        description={
          plan && daysRemaining !== null
            ? `${plan.targetExam} · ${daysRemaining} days remaining`
            : "Your personalized study schedule"
        }
        action={
          plan && (
            <button
              onClick={() => setShowForm(true)}
              className={buttonClass("secondary", "md")}
            >
              <LuSparkles className="h-4 w-4" />
              Regenerate
            </button>
          )
        }
      />

      {/* Setup form */}
      {showForm && (
        <div className="card mb-8 animate-slide-up p-6">
          <h2 className="text-lg font-bold tracking-tight text-foreground">
            {plan ? "Regenerate Study Plan" : "Set Up Your Study Plan"}
          </h2>
          <p className="mt-1 text-sm text-muted">
            Tell us about your exam and we&apos;ll build a schedule you can actually follow.
          </p>

          <div className="mb-6 mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
            <div>
              <span className="label">Target Exam</span>
              <div className="flex gap-2">
                {(["WAEC", "JAMB", "NECO"] as const).map((exam) => (
                  <button
                    key={exam}
                    type="button"
                    aria-pressed={targetExam === exam}
                    onClick={() => setTargetExam(exam)}
                    className={cn(
                      "flex-1 rounded-xl border py-2.5 text-sm font-semibold transition-all",
                      targetExam === exam
                        ? "border-primary bg-primary text-primary-foreground shadow-soft"
                        : "border-border bg-card text-muted hover:border-primary/30",
                    )}
                  >
                    {exam}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="label" htmlFor="targetDate">
                Exam Date
              </label>
              <input
                id="targetDate"
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                className="input"
              />
            </div>

            <div>
              <label className="label" htmlFor="dailyHours">
                Daily Study Hours
              </label>
              <input
                id="dailyHours"
                type="number"
                min={0.5}
                max={12}
                step={0.5}
                value={dailyHours}
                onChange={(e) => setDailyHours(parseFloat(e.target.value) || 2)}
                className="input"
              />
              <p className="mt-1.5 text-xs text-muted">
                Keep it realistic — consistency beats intensity.
              </p>
            </div>
          </div>

          <div className="mb-6">
            <span className="label">Subjects to Study</span>
            <div className="flex flex-wrap gap-2">
              {subjects.map((subject) => {
                const selected = selectedSubjectIds.includes(subject.id);
                return (
                  <button
                    key={subject.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => toggleSubject(subject.id)}
                    className={cn(
                      "rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all",
                      selected
                        ? "border-primary bg-primary text-primary-foreground shadow-soft"
                        : "border-border bg-card text-muted hover:border-primary/30",
                    )}
                  >
                    {selected && <LuCheck className="mr-1 inline h-3 w-3" />}
                    {subject.code || subject.name}
                  </button>
                );
              })}
            </div>
          </div>

          {error && <p className="mb-4 text-sm text-danger">{error}</p>}

          <button
            onClick={handleGenerate}
            disabled={generating || !targetDate || selectedSubjectIds.length === 0}
            className={buttonClass("primary", "lg")}
          >
            <LuSparkles className="h-4 w-4" />
            {generating ? "Generating..." : plan ? "Regenerate Plan" : "Create Plan"}
          </button>
        </div>
      )}

      {/* Plan view */}
      {plan && currentWeek && (
        <>
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="card p-5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-muted">Progress</p>
                <span className="text-sm font-bold text-foreground">{progress}%</span>
              </div>
              <Progress value={progress} tone="auto" className="mt-3 h-2.5" />
            </div>
            <div className="card p-5">
              <p className="text-xs font-semibold text-muted">Completed</p>
              <p className="mt-1 text-2xl font-bold tracking-tight text-success">
                {completedItems}
              </p>
              <p className="mt-0.5 text-xs text-muted">out of {totalItems} sessions</p>
            </div>
            <div className="card p-5">
              <p className="text-xs font-semibold text-muted">Daily Target</p>
              <p className="mt-1 text-2xl font-bold tracking-tight text-foreground">
                {plan.dailyStudyHours}h
              </p>
              <p className="mt-0.5 text-xs text-muted">per day</p>
            </div>
          </div>

          <div className="mb-4 flex items-center justify-between">
            <button
              onClick={() => setCurrentWeekIdx((p) => Math.max(0, p - 1))}
              disabled={currentWeekIdx === 0}
              className="flex items-center gap-1 text-sm font-semibold text-muted transition-colors hover:text-foreground disabled:opacity-30"
            >
              <LuChevronLeft className="h-4 w-4" /> Previous week
            </button>
            <span className="text-sm font-bold text-foreground">
              Week {currentWeekIdx + 1} of {weeks.length}
            </span>
            <button
              onClick={() =>
                setCurrentWeekIdx((p) => Math.min(weeks.length - 1, p + 1))
              }
              disabled={currentWeekIdx === weeks.length - 1}
              className="flex items-center gap-1 text-sm font-semibold text-muted transition-colors hover:text-foreground disabled:opacity-30"
            >
              Next week <LuChevronRight className="h-4 w-4" />
            </button>
          </div>

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
              const isRunway =
                plan.runwayStart != null &&
                day.date >= plan.runwayStart.slice(0, 10);

              return (
                <div key={day.date} className="card p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-muted">
                        {dayName}
                      </span>
                      <span className="text-xs text-muted">{dateStr}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {isRunway && <Badge variant="amber">Runway</Badge>}
                      <Badge variant={dayCompleted === day.items.length ? "green" : "neutral"}>
                        {dayCompleted}/{day.items.length}
                      </Badge>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {day.items.map((item) => {
                      const isDone = item.status === "COMPLETED";
                      return (
                        <div
                          key={item.id}
                          className={cn(
                            "flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors",
                            isDone
                              ? "border-green-200 bg-green-50/70"
                              : "border-border bg-secondary/30",
                          )}
                        >
                          <Badge
                            variant={isDone ? "green" : (activityBadge[item.activityType] ?? "neutral")}
                          >
                            {activityIcons[item.activityType] ?? <LuBookOpen className="h-3.5 w-3.5" />}
                          </Badge>
                          <div className="min-w-0 flex-1">
                            <p
                              className={cn(
                                "truncate text-xs font-semibold",
                                isDone ? "text-green-800" : "text-foreground",
                              )}
                            >
                              {item.subject.code} — {item.activityType.replace(/_/g, " ")}
                            </p>
                            {item.notes && (
                              <p className="truncate text-xs text-muted">
                                {item.notes}
                              </p>
                            )}
                          </div>
                          <span className="flex-shrink-0 text-xs text-muted">
                            {item.durationMinutes}min
                          </span>
                          {isDone && <LuCheck className="h-4 w-4 flex-shrink-0 text-success" />}
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
        <EmptyState
          icon={<LuCalendar className="h-6 w-6" />}
          title="No sessions scheduled for this week"
          description="Looks like your plan is wrapping up. Great job staying consistent!"
        />
      )}

      {!plan && !showForm && (
        <EmptyState
          tone="primary"
          icon={<LuCalendar className="h-6 w-6" />}
          title="No study plan yet"
          description="Set an exam date and we'll build a step-by-step schedule to get you ready."
          action={
            <button onClick={() => setShowForm(true)} className={buttonClass("primary", "lg")}>
              <LuPlus className="h-4 w-4" />
              Create a Study Plan
            </button>
          }
        />
      )}
    </div>
  );
}
