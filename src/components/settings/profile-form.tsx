"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { NIGERIAN_STATES } from "@/lib/constants/exam-types";
import {
  FormMessage,
  Section,
  inputClass,
  labelClass,
  submitClass,
} from "./section";

export function ProfileForm({
  email,
  firstName,
  lastName,
  phone,
  state,
}: {
  email: string | null;
  firstName: string;
  lastName: string;
  phone: string | null;
  state: string | null;
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    firstName,
    lastName,
    phone: phone ?? "",
    state: state ?? "",
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
        setError(data.error ?? "Could not save your details.");
        return;
      }

      setSuccess("Details saved.");
      // Refresh so the sidebar and header pick up the new name.
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Section title="Profile" description="Your name and contact details.">
      <FormMessage error={error} success={success} />

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className={labelClass} htmlFor="firstName">
              First name
            </label>
            <input
              id="firstName"
              type="text"
              value={form.firstName}
              onChange={(e) => update("firstName", e.target.value)}
              required
              minLength={2}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="lastName">
              Last name
            </label>
            <input
              id="lastName"
              type="text"
              value={form.lastName}
              onChange={(e) => update("lastName", e.target.value)}
              required
              minLength={2}
              className={inputClass}
            />
          </div>
        </div>

        <div>
          <label className={labelClass} htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email ?? ""}
            readOnly
            disabled
            className={`${inputClass} bg-secondary text-muted cursor-not-allowed`}
          />
          <p className="text-xs text-muted mt-1.5">
            Your email is how you sign in, so it can&apos;t be changed here.
          </p>
        </div>

        <div>
          <label className={labelClass} htmlFor="phone">
            Phone number
          </label>
          <input
            id="phone"
            type="tel"
            value={form.phone}
            onChange={(e) => update("phone", e.target.value)}
            className={inputClass}
            placeholder="08012345678"
          />
        </div>

        <div>
          <label className={labelClass} htmlFor="state">
            State
          </label>
          <select
            id="state"
            value={form.state}
            onChange={(e) => update("state", e.target.value)}
            className={inputClass}
          >
            <option value="">Select your state</option>
            {NIGERIAN_STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <button type="submit" disabled={loading} className={submitClass}>
          {loading ? "Saving..." : "Save changes"}
        </button>
      </form>
    </Section>
  );
}
