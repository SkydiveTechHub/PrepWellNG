"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FormMessage, Section, labelClass, submitClass } from "./section";

const LEVELS = ["SS1", "SS2", "SS3"];
const TRACKS = [
  { value: "SCIENCE", label: "Science" },
  { value: "ARTS", label: "Arts" },
  { value: "COMMERCIAL", label: "Commercial" },
];

export function AcademicForm({
  classLevel,
  track,
}: {
  classLevel: string | null;
  track: string | null;
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    classLevel: classLevel ?? "",
    track: track ?? "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  function update(field: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setError("");
    setSuccess("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!form.classLevel || !form.track) {
      setError("Pick both a class level and a track.");
      return;
    }

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const res = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Could not save your class details.");
        return;
      }

      setSuccess("Class details saved.");
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const optionClass = (selected: boolean) =>
    `py-3 rounded-lg border text-center text-sm font-semibold transition-all ${
      selected
        ? "border-primary bg-primary/10 text-primary"
        : "border-border bg-card text-foreground hover:border-primary/30"
    }`;

  return (
    <Section
      title="Class & track"
      description="These decide which subjects and past questions you see."
    >
      <FormMessage error={error} success={success} />

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <span className={labelClass}>Class level</span>
          <div className="grid grid-cols-3 gap-3">
            {LEVELS.map((level) => (
              <button
                key={level}
                type="button"
                aria-pressed={form.classLevel === level}
                onClick={() => update("classLevel", level)}
                className={optionClass(form.classLevel === level)}
              >
                {level}
              </button>
            ))}
          </div>
        </div>

        <div>
          <span className={labelClass}>Track</span>
          <div className="grid grid-cols-3 gap-3">
            {TRACKS.map((t) => (
              <button
                key={t.value}
                type="button"
                aria-pressed={form.track === t.value}
                onClick={() => update("track", t.value)}
                className={optionClass(form.track === t.value)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <button type="submit" disabled={loading} className={submitClass}>
          {loading ? "Saving..." : "Save changes"}
        </button>
      </form>
    </Section>
  );
}
