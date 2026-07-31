"use client";

import { useState } from "react";
import {
  FormMessage,
  Section,
  inputClass,
  labelClass,
  submitClass,
} from "./section";

export function PasswordForm() {
  const [form, setForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
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

    // Confirmation is a client-side concern only — the API never sees it.
    if (form.newPassword !== form.confirmPassword) {
      setError("The new passwords don't match.");
      return;
    }

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const res = await fetch("/api/user/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: form.currentPassword,
          newPassword: form.newPassword,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Could not change your password.");
        return;
      }

      setSuccess("Password changed.");
      setForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Section title="Password" description="Change the password you sign in with.">
      <FormMessage error={error} success={success} />

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className={labelClass} htmlFor="currentPassword">
            Current password
          </label>
          <input
            id="currentPassword"
            type="password"
            autoComplete="current-password"
            value={form.currentPassword}
            onChange={(e) => update("currentPassword", e.target.value)}
            required
            className={inputClass}
          />
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className={labelClass} htmlFor="newPassword">
              New password
            </label>
            <input
              id="newPassword"
              type="password"
              autoComplete="new-password"
              value={form.newPassword}
              onChange={(e) => update("newPassword", e.target.value)}
              required
              minLength={6}
              className={inputClass}
              placeholder="At least 6 characters"
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="confirmPassword">
              Confirm new password
            </label>
            <input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              value={form.confirmPassword}
              onChange={(e) => update("confirmPassword", e.target.value)}
              required
              minLength={6}
              className={inputClass}
            />
          </div>
        </div>

        <button type="submit" disabled={loading} className={submitClass}>
          {loading ? "Changing..." : "Change password"}
        </button>
      </form>
    </Section>
  );
}
