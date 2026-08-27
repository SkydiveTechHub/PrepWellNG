"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { StatusBanner } from "@/components/admin/status-banner";
import { CLASS_LEVELS } from "@/lib/curriculum-scope";
import { TRACKS } from "@/lib/admin-student";

const LABEL_CLS = "text-[11px] font-semibold uppercase tracking-wider text-muted";
const INPUT_CLS =
  "px-3 py-2 rounded-lg border border-border bg-card text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60";

export function StudentProfileForm({
  student,
  canEdit,
  className,
}: {
  student: {
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
    classLevel: string | null;
    track: string | null;
    state: string | null;
  };
  canEdit: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);

    const form = new FormData(event.currentTarget);
    // Empty strings are "not supplied", not "set to empty" — the schema marks
    // these fields optional, and sending "" would fail its validators.
    const body: Record<string, string> = {};
    for (const [key, value] of form.entries()) {
      const text = String(value).trim();
      if (text) body[key] = text;
    }

    try {
      const res = await fetch(`/admin/api/students/${student.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not save");
        return;
      }
      setSaved(true);
      router.refresh();
    } catch {
      setError("Could not reach the server");
    } finally {
      setSaving(false);
    }
  }

  if (!canEdit) {
    return (
      <p className={cn("text-sm text-muted", className)}>
        You do not have permission to edit this profile.
      </p>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className={cn("rounded-lg border border-border-strong bg-card p-4", className)}
    >
      {error && <StatusBanner tone="error" title={error} className="mb-4" />}
      {saved && !error && (
        <StatusBanner tone="success" title="Profile saved" className="mb-4" />
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field name="firstName" label="First name" defaultValue={student.firstName} required />
        <Field name="lastName" label="Last name" defaultValue={student.lastName} required />
        <Field name="email" label="Email" type="email" defaultValue={student.email ?? ""} />
        <Field name="phone" label="Phone" defaultValue={student.phone ?? ""} />
        <Field name="state" label="State" defaultValue={student.state ?? ""} />

        <div className="flex flex-col gap-1">
          <label htmlFor="classLevel" className={LABEL_CLS}>Class</label>
          <select id="classLevel" name="classLevel" defaultValue={student.classLevel ?? ""} className={INPUT_CLS}>
            <option value="">Not set</option>
            {CLASS_LEVELS.map((level) => (
              <option key={level} value={level}>{level}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="track" className={LABEL_CLS}>Track</label>
          <select id="track" name="track" defaultValue={student.track ?? ""} className={INPUT_CLS}>
            <option value="">Not set</option>
            {TRACKS.map((track) => (
              <option key={track} value={track}>
                {track.charAt(0) + track.slice(1).toLowerCase()}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-4">
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save profile"}
        </Button>
      </div>
    </form>
  );
}

function Field({
  name,
  label,
  defaultValue,
  type = "text",
  required,
}: {
  name: string;
  label: string;
  defaultValue: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={name} className={LABEL_CLS}>{label}</label>
      <input
        id={name}
        name={name}
        type={type}
        defaultValue={defaultValue}
        required={required}
        className={INPUT_CLS}
      />
    </div>
  );
}
