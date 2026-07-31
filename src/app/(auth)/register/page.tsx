"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { LuGraduationCap } from "react-icons/lu";
import { NIGERIAN_STATES } from "@/lib/constants/exam-types";

export default function RegisterPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
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

    if (step < 3) {
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

      // Registration successful — redirect to login
      router.push("/login?registered=true");
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      {/* Mobile logo */}
      <div className="lg:hidden flex items-center gap-2.5 mb-8">
        <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
          <LuGraduationCap className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold">PrepWell NG</h1>
        </div>
      </div>

      <h2 className="text-2xl font-bold text-foreground">Create your account</h2>
      <p className="text-muted mt-1 mb-6">
        Step {step} of 3 —{" "}
        {step === 1
          ? "Your details"
          : step === 2
            ? "Your class level"
            : "Your location"}
      </p>

      {/* Progress bar */}
      <div className="flex gap-2 mb-8">
        {[1, 2, 3].map((s) => (
          <div
            key={s}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              s <= step ? "bg-primary" : "bg-border"
            }`}
          />
        ))}
      </div>

      {/* Error message */}
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Step 1: Personal info */}
        {step === 1 && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1.5">
                  First name
                </label>
                <input
                  type="text"
                  value={form.firstName}
                  onChange={(e) => update("firstName", e.target.value)}
                  required
                  className="w-full px-3 py-2.5 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">
                  Last name
                </label>
                <input
                  type="text"
                  value={form.lastName}
                  onChange={(e) => update("lastName", e.target.value)}
                  required
                  className="w-full px-3 py-2.5 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => update("email", e.target.value)}
                required
                className="w-full px-3 py-2.5 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">
                Password
              </label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => update("password", e.target.value)}
                required
                minLength={6}
                className="w-full px-3 py-2.5 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                placeholder="At least 6 characters"
              />
            </div>
          </>
        )}

        {/* Step 2: Class level & track */}
        {step === 2 && (
          <>
            <div>
              <label className="block text-sm font-medium mb-3">
                What class are you in?
              </label>
              <div className="grid grid-cols-3 gap-3">
                {["SS1", "SS2", "SS3"].map((level) => (
                  <button
                    key={level}
                    type="button"
                    onClick={() => update("classLevel", level)}
                    className={`py-4 rounded-lg border text-center font-semibold transition-all ${
                      form.classLevel === level
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-card text-foreground hover:border-primary/30"
                    }`}
                  >
                    {level}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-3">
                What track are you in?
              </label>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { value: "SCIENCE", label: "Science" },
                  { value: "ARTS", label: "Arts" },
                  { value: "COMMERCIAL", label: "Commercial" },
                ].map((track) => (
                  <button
                    key={track.value}
                    type="button"
                    onClick={() => update("track", track.value)}
                    className={`py-4 rounded-lg border text-center font-semibold transition-all ${
                      form.track === track.value
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-card text-foreground hover:border-primary/30"
                    }`}
                  >
                    {track.label}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Step 3: State */}
        {step === 3 && (
          <div>
            <label className="block text-sm font-medium mb-1.5">
              State (optional)
            </label>
            <select
              value={form.state}
              onChange={(e) => update("state", e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            >
              <option value="">Select your state</option>
              {NIGERIAN_STATES.map((state) => (
                <option key={state} value={state}>
                  {state}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="flex gap-3 pt-2">
          {step > 1 && (
            <button
              type="button"
              onClick={() => setStep(step - 1)}
              className="flex-1 py-2.5 rounded-lg border border-border text-sm font-medium hover:bg-secondary transition-colors"
            >
              Back
            </button>
          )}
          <button
            type="submit"
            disabled={loading}
            className="flex-1 bg-primary text-primary-foreground py-2.5 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {step < 3
              ? "Continue"
              : loading
                ? "Creating account..."
                : "Create account"}
          </button>
        </div>
      </form>

      <p className="text-center text-sm text-muted mt-6">
        Already have an account?{" "}
        <Link href="/login" className="text-primary font-medium hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
