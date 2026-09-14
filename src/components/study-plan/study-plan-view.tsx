"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LuCalendar, LuPlus, LuSettings2, LuTriangleAlert } from "react-icons/lu";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { buttonClass } from "@/components/ui/button";
import type { StudyPlanPageData } from "@/lib/study-plan";
import { ClassPositionPanel } from "./class-position-panel";
import { PlanSchedule } from "./plan-schedule";
import { PlanSetupForm, type PlanSettings } from "./plan-setup-form";

/**
 * Everything arrives from the server page, which re-plans first. Mutations call
 * the API and refresh, so the server stays the only copy of the plan.
 */
export function StudyPlanView({ data }: { data: StudyPlanPageData }) {
  const router = useRouter();
  const { plan } = data;
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");

  async function request(url: string, method: string, body: unknown): Promise<string | null> {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      return payload.error ?? "Something went wrong. Please try again.";
    }
    router.refresh();
    return null;
  }

  async function saveSettings(settings: PlanSettings) {
    const problem = await request("/api/study-plan", plan ? "PATCH" : "POST", settings);
    if (!problem) setEditing(false);
    return problem;
  }

  async function setStatus(id: string, status: "COMPLETED" | "SKIPPED" | "PENDING") {
    setError((await request(`/api/study-plan/items/${id}`, "PATCH", { status })) ?? "");
  }

  async function savePositions(positions: { subjectId: string; topicId: string | null }[]) {
    setError((await request("/api/study-plan/positions", "PUT", { positions })) ?? "");
  }

  const description = [
    data.classLevel,
    data.termLabel,
    plan?.targetExam && data.daysToExam !== null ? `${plan.targetExam} in ${data.daysToExam} days` : null,
  ].filter(Boolean).join(" · ");

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Study Plan"
        description={description}
        action={
          plan && !editing && (
            <button type="button" onClick={() => setEditing(true)} className={buttonClass("secondary", "md")}>
              <LuSettings2 className="h-4 w-4" />
              Change plan
            </button>
          )
        }
      />

      {error && <p className="mb-4 text-sm text-danger">{error}</p>}

      {editing && (
        <PlanSetupForm data={data} plan={plan} onSubmit={saveSettings} onCancel={plan ? () => setEditing(false) : undefined} />
      )}

      {!plan && !editing && (
        <EmptyState
          tone="primary"
          icon={<LuCalendar className="h-6 w-6" />}
          title="No study plan yet"
          description="Pick your subjects and when you can study. We'll plan your term week by week."
          action={
            <button type="button" onClick={() => setEditing(true)} className={buttonClass("primary", "lg")}>
              <LuPlus className="h-4 w-4" />
              Create a study plan
            </button>
          }
        />
      )}

      {plan && !editing && (
        <div className="space-y-6">
          <div className="flex flex-wrap gap-2">
            {plan.mode === "BLENDED" && <Badge variant="purple">Term + exam prep</Badge>}
            {plan.mode === "EXAM" && <Badge variant="red">Exam mode</Badge>}
            {data.termSource === "fallback" && <Badge variant="neutral">Term dates are approximate</Badge>}
          </div>

          {plan.overload && (
            <div role="status" className="flex items-start gap-3 rounded-xl border border-tone-amber-line bg-tone-amber-soft px-4 py-3 text-sm text-tone-amber-ink">
              <LuTriangleAlert className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <p>
                You&apos;re about {plan.overload.topicsBehind} {plan.overload.topicsBehind === 1 ? "topic" : "topics"} behind.
                Adding {plan.overload.suggestedExtraMinutesPerWeek} minutes a week would help you catch up.
              </p>
            </div>
          )}

          <PlanSchedule plan={plan} today={data.today} onStatus={setStatus} />
          <ClassPositionPanel plan={plan} subjects={data.subjects} onSave={savePositions} />
        </div>
      )}
    </div>
  );
}
