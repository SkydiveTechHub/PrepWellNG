"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { NIGERIAN_STATES } from "@/lib/constants/exam-types";
import { cn } from "@/lib/utils";

const CLASS_LEVELS = ["SS1", "SS2", "SS3"];
const TRACKS = [
  { value: "SCIENCE", label: "Science" },
  { value: "ARTS", label: "Arts" },
  { value: "COMMERCIAL", label: "Commercial" },
];

type Fields = { classLevel: string; track: string; state: string };

export function CompleteProfileForm({
  firstName,
  initial,
}: {
  firstName: string;
  initial: Fields;
}) {
  const router = useRouter();
  const [form, setForm] = useState<Fields>(initial);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  function update(field: keyof Fields, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.classLevel) return setError("Please select your class level.");
    if (!form.track) return setError("Please select your track.");
    if (!form.state) return setError("Please select your state.");

    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/user/complete-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong. Please try again.");
        return;
      }
      // replace, not push: Back must not return to a step that is done.
      router.replace("/dashboard");
      router.refresh();
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSignOut() {
    // Same order as the user menu: the next student on a shared phone must not
    // receive this student's reminders.
    const [{ signOut }, { unsubscribeThisDevice }] = await Promise.all([
      import("next-auth/react"),
      import("@/lib/push-client"),
    ]);
    await unsubscribeThisDevice();
    signOut({ callbackUrl: "/login" });
  }

  const optionClass = (selected: boolean) =>
    cn(
      "py-4 rounded-xl border text-center text-sm font-bold transition-all",
      selected
        ? "border-primary bg-primary-soft text-primary ring-4 ring-primary/15"
        : "border-border bg-card text-foreground hover:border-primary/40",
    );

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-foreground">
        Finish setting up your account
      </h1>
      <p className="mt-1 text-muted">
        {firstName ? `Welcome, ${firstName}. ` : ""}Three quick questions and you&apos;re in.
      </p>

      {error && (
        <div
          role="alert"
          className="mt-5 rounded-xl border border-danger/25 bg-danger-soft p-3.5 text-sm font-medium text-danger animate-fade-in"
        >
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-6 space-y-5">
        <fieldset>
          <legend className="mb-3 block text-sm font-semibold text-foreground">
            What class are you in?
          </legend>
          <div className="grid grid-cols-3 gap-3">
            {CLASS_LEVELS.map((level) => (
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
        </fieldset>

        <fieldset>
          <legend className="mb-3 block text-sm font-semibold text-foreground">
            What track are you in?
          </legend>
          <div className="grid grid-cols-3 gap-3">
            {TRACKS.map((track) => (
              <button
                key={track.value}
                type="button"
                aria-pressed={form.track === track.value}
                onClick={() => update("track", track.value)}
                className={optionClass(form.track === track.value)}
              >
                {track.label}
              </button>
            ))}
          </div>
        </fieldset>

        <div>
          <label
            htmlFor="state"
            className="mb-1.5 block text-sm font-semibold text-foreground"
          >
            Which state do you live in?
          </label>
          <select
            id="state"
            value={form.state}
            onChange={(e) => update("state", e.target.value)}
            required
            className="input"
          >
            <option value="">Select your state</option>
            {NIGERIAN_STATES.map((state) => (
              <option key={state} value={state}>
                {state}
              </option>
            ))}
          </select>
        </div>

        <p className="rounded-xl bg-secondary/60 p-3.5 text-xs leading-relaxed text-muted">
          Your track shapes which subjects and past questions are shown first.
          You can change any of this later in settings.
        </p>

        <button
          type="submit"
          disabled={saving}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground shadow-soft transition-all hover:bg-primary-hover active:scale-[0.99] disabled:opacity-50"
        >
          {saving ? "Saving…" : "Continue to dashboard"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        Not you?{" "}
        <button
          type="button"
          onClick={handleSignOut}
          className="font-bold text-primary hover:underline"
        >
          Sign out
        </button>
      </p>
    </div>
  );
}
