"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  LuGraduationCap,
  LuMail,
  LuLock,
  LuUser,
  LuArrowRight,
  LuArrowLeft,
  LuCheck,
  LuEye,
  LuEyeOff,
} from "react-icons/lu";
import { NIGERIAN_STATES } from "@/lib/constants/exam-types";
import { cn } from "@/lib/utils";

// Two steps, not three. State was a single optional dropdown on a step of its
// own, which read as a hurdle rather than a question — it now sits with the
// other academic details.
const STEPS = [{ label: "Your details" }, { label: "Class & track" }];

const LAST_STEP = STEPS.length;

export default function RegisterPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    classLevel: "" as string,
    track: "" as string,
    state: "",
  });

  function update(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setError("");
  }

  function validateStep(): boolean {
    if (step === 1) {
      if (!form.firstName.trim() || !form.lastName.trim()) {
        setError("Please enter your first and last name.");
        return false;
      }
      if (!form.email.trim()) {
        setError("Please enter your email address.");
        return false;
      }
      if (form.password.length < 6) {
        setError("Password must be at least 6 characters.");
        return false;
      }
    }
    if (step === 2) {
      if (!form.classLevel) {
        setError("Please select your class level.");
        return false;
      }
      if (!form.track) {
        setError("Please select your track.");
        return false;
      }
    }
    return true;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!validateStep()) return;

    if (step < LAST_STEP) {
      setStep(step + 1);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong. Please try again.");
        return;
      }

      router.push("/login?registered=true");
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
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
      {/* Mobile logo */}
      <div className="mb-8 flex items-center gap-2.5 lg:hidden">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-brand">
          <LuGraduationCap className="h-6 w-6 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight">PrepWell</h1>
        </div>
      </div>

      <h2 className="text-2xl font-bold tracking-tight text-foreground">
        Create your account
      </h2>
      <p className="mt-1 text-muted">Free forever for students.</p>

      {/* Stepper */}
      <ol className="mt-8 flex items-center gap-2">
        {STEPS.map((s, i) => {
          const n = i + 1;
          const done = n < step;
          const active = n === step;
          return (
            <li key={s.label} className="flex flex-1 flex-col gap-1.5">
              <div
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-colors",
                  done
                    ? "bg-success text-white"
                    : active
                      ? "bg-primary text-white ring-4 ring-primary/15"
                      : "bg-secondary text-muted",
                )}
              >
                {done ? <LuCheck className="h-4 w-4" /> : n}
              </div>
              <span
                className={cn(
                  "text-[11px] font-semibold",
                  active ? "text-foreground" : "text-muted",
                )}
              >
                {s.label}
              </span>
            </li>
          );
        })}
      </ol>

      {error && (
        <div className="mt-5 rounded-xl border border-danger/25 bg-danger-soft p-3.5 text-sm font-medium text-danger animate-fade-in">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        {/* Step 1: Personal info */}
        {step === 1 && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-foreground">
                  First name
                </label>
                <div className="relative">
                  <LuUser className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                  <input
                    type="text"
                    autoComplete="given-name"
                    value={form.firstName}
                    onChange={(e) => update("firstName", e.target.value)}
                    required
                    className="input pl-10"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-foreground">
                  Last name
                </label>
                <input
                  type="text"
                  autoComplete="family-name"
                  value={form.lastName}
                  onChange={(e) => update("lastName", e.target.value)}
                  required
                  className="input"
                />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-foreground">
                Email
              </label>
              <div className="relative">
                <LuMail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                <input
                  type="email"
                  autoComplete="email"
                  value={form.email}
                  onChange={(e) => update("email", e.target.value)}
                  required
                  placeholder="you@example.com"
                  className="input pl-10"
                />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-foreground">
                Password
              </label>
              <div className="relative">
                <LuLock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={form.password}
                  onChange={(e) => update("password", e.target.value)}
                  required
                  minLength={6}
                  placeholder="At least 6 characters"
                  className="input pl-10 pr-11"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-muted transition-colors hover:bg-secondary hover:text-foreground"
                >
                  {showPassword ? (
                    <LuEyeOff className="h-4 w-4" />
                  ) : (
                    <LuEye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
          </>
        )}

        {/* Step 2: Class level & track */}
        {step === 2 && (
          <>
            <div>
              <span className="mb-3 block text-sm font-semibold text-foreground">
                What class are you in?
              </span>
              <div className="grid grid-cols-3 gap-3">
                {["SS1", "SS2", "SS3"].map((level) => (
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
              <span className="mb-3 block text-sm font-semibold text-foreground">
                What track are you in?
              </span>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { value: "SCIENCE", label: "Science" },
                  { value: "ARTS", label: "Arts" },
                  { value: "COMMERCIAL", label: "Commercial" },
                ].map((track) => (
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
            </div>
            <div>
              <label
                htmlFor="state"
                className="mb-1.5 block text-sm font-semibold text-foreground"
              >
                State <span className="font-normal text-muted">(optional)</span>
              </label>
              <select
                id="state"
                value={form.state}
                onChange={(e) => update("state", e.target.value)}
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
              You can change this later in settings.
            </p>
          </>
        )}

        <div className="flex gap-3 pt-2">
          {step > 1 && (
            <button
              type="button"
              onClick={() => setStep(step - 1)}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm font-bold text-foreground transition-all hover:bg-secondary active:scale-[0.99]"
            >
              <LuArrowLeft className="h-4 w-4" />
              Back
            </button>
          )}
          <button
            type="submit"
            disabled={loading}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground shadow-soft transition-all hover:bg-primary-hover active:scale-[0.99] disabled:opacity-50"
          >
            {step < LAST_STEP
              ? "Continue"
              : loading
                ? "Creating account…"
                : "Create account"}
            {step < LAST_STEP && !loading && <LuArrowRight className="h-4 w-4" />}
          </button>
        </div>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-bold text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
