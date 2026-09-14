"use client";

import { useState } from "react";
import { buttonClass } from "@/components/ui/button";
import type { StudyPlanData, StudyPlanSubject } from "@/lib/study-plan";

const FOLLOW = "";

export function ClassPositionPanel({
  plan,
  subjects,
  onSave,
}: {
  plan: StudyPlanData;
  subjects: StudyPlanSubject[];
  onSave: (positions: { subjectId: string; topicId: string | null }[]) => Promise<void>;
}) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(plan.subjectIds.map((id) => [id, plan.positions[id] ?? FOLLOW])),
  );
  const [saving, setSaving] = useState(false);
  const names = Object.fromEntries(subjects.map((s) => [s.id, s.name]));

  async function save() {
    setSaving(true);
    try {
      await onSave(plan.subjectIds.map((subjectId) => ({ subjectId, topicId: values[subjectId] || null })));
    } finally {
      setSaving(false);
    }
  }

  return (
    <details className="card p-5">
      <summary className="cursor-pointer text-sm font-bold text-foreground">Where is your class?</summary>
      <p className="mt-2 text-xs text-muted">
        We guess from the school calendar. If your teacher is ahead or behind, pick the topic your class is on now.
      </p>
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        {plan.subjectIds.map((subjectId) => {
          const guessId = plan.calendarPositions[subjectId];
          const options = plan.positionOptions[subjectId] ?? [];
          const guess = options.find((o) => o.id === guessId);
          return (
            <label key={subjectId} className="text-sm">
              <span className="label">{names[subjectId] ?? "Subject"}</span>
              <select className="input" value={values[subjectId]}
                onChange={(e) => setValues({ ...values, [subjectId]: e.target.value })}>
                <option value={FOLLOW}>
                  Follow the calendar{guess ? ` (${guess.title})` : ""}
                </option>
                {options.map((o) => (
                  <option key={o.id} value={o.id}>{o.scope} — {o.title}</option>
                ))}
              </select>
              {!guessId && (
                <span className="mt-1 block text-xs text-muted">
                  No topics for this term yet in {names[subjectId] ?? "this subject"} — revision only.
                </span>
              )}
            </label>
          );
        })}
      </div>
      <button type="button" disabled={saving} onClick={save} className={buttonClass("primary", "md", "mt-4")}>
        {saving ? "Updating plan..." : "Update my plan"}
      </button>
    </details>
  );
}
