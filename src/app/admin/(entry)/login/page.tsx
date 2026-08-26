"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { LuShield, LuLock, LuUser } from "react-icons/lu";
import { AdminSessionProvider } from "@/components/admin/admin-session-provider";

function AdminLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Relative paths under /admin only — anything else is an open redirect or a
  // way to bounce an admin into the student app.
  const requested = searchParams.get("callbackUrl");
  const callbackUrl =
    requested && requested.startsWith("/admin") && !requested.startsWith("//")
      ? requested
      : "/admin";

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const { signIn } = await import("next-auth/react");
      const result = await signIn("admin-credentials", {
        identifier,
        password,
        redirect: false,
      });

      // One message for every failure — bad identifier, bad password, and
      // deactivated account are indistinguishable to someone guessing.
      if (result?.error) setError("Invalid credentials.");
      else {
        router.push(callbackUrl);
        router.refresh();
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center px-6">
      <div className="mb-8 flex items-center gap-2.5">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary">
          <LuShield className="h-5 w-5 text-white" />
        </div>
        <h1 className="text-xl font-bold tracking-tight">Admin console</h1>
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-danger/25 bg-danger-soft p-3.5 text-sm font-medium text-danger">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block">
          <span className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <LuUser className="h-4 w-4" /> Email or username
          </span>
          <input
            type="text"
            autoComplete="username"
            required
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground outline-none focus:border-primary"
          />
        </label>

        <label className="block">
          <span className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <LuLock className="h-4 w-4" /> Password
          </span>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground outline-none focus:border-primary"
          />
        </label>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-bold text-white transition-all disabled:opacity-60"
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    // The provider is what points signIn() at /admin/api/auth. Without it the
    // form posts to the student instance and "admin-credentials" is unknown.
    <AdminSessionProvider>
      <Suspense>
        <AdminLoginForm />
      </Suspense>
    </AdminSessionProvider>
  );
}
