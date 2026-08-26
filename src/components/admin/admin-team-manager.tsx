"use client";

import { useState } from "react";
import { StatusBanner } from "@/components/admin/status-banner";

export type TeamAdmin = {
  id: string;
  email: string | null;
  username: string | null;
  isOwner: boolean;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
};

const label = (a: TeamAdmin) => a.email ?? a.username ?? a.id;
const CELL = "px-4 py-2.5 text-sm";

export function AdminTeamManager({
  initialAdmins,
  currentAdminId,
}: {
  initialAdmins: TeamAdmin[];
  currentAdminId: string;
}) {
  const [admins, setAdmins] = useState(initialAdmins);
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  // Shown once after creation. Nothing can recover the password later — it is
  // stored only as a bcrypt hash.
  const [created, setCreated] = useState<{ id: string; password: string } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setCreated(null);

    try {
      const res = await fetch("/admin/api/admins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Could not create that admin.");
        return;
      }

      setAdmins((prev) => [...prev, data.admin]);
      setCreated({ id: label(data.admin), password });
      setIdentifier("");
      setPassword("");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(admin: TeamAdmin) {
    setBusy(true);
    setError("");

    try {
      const res = await fetch(`/admin/api/admins/${admin.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !admin.isActive }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Could not update that admin.");
        return;
      }

      setAdmins((prev) =>
        prev.map((a) =>
          a.id === admin.id ? { ...a, isActive: !admin.isActive } : a,
        ),
      );
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      {error && <StatusBanner tone="error" title={error} />}

      {created && (
        <StatusBanner
          tone="success"
          title={`Admin ${created.id} created`}
          message={`Password: ${created.password} — copy it now. It is stored only as a hash and cannot be shown again.`}
        />
      )}

      <form
        onSubmit={handleCreate}
        className="flex flex-col gap-3 rounded-lg border border-border-strong bg-card p-4 sm:flex-row sm:items-end"
      >
        <label className="flex-1">
          <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted">
            Email or username
          </span>
          <input
            type="text"
            required
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
          />
        </label>

        <label className="flex-1">
          <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted">
            Password
          </span>
          <input
            type="text"
            required
            minLength={12}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
          />
        </label>

        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          Create admin
        </button>
      </form>

      <div className="overflow-hidden rounded-lg border border-border-strong bg-card">
        <table className="w-full">
          <caption className="sr-only">Admin accounts</caption>
          <thead>
            <tr className="border-b border-border-strong text-[11px] font-semibold uppercase tracking-wider text-muted">
              <th scope="col" className="px-4 py-2.5 text-left">Admin</th>
              <th scope="col" className="px-4 py-2.5 text-left">Status</th>
              <th scope="col" className="px-4 py-2.5 text-left">Last login</th>
              <th scope="col" className="px-4 py-2.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {admins.map((admin) => (
              <tr key={admin.id} className="border-b border-border-strong last:border-0">
                <td className={CELL}>
                  <span className="font-medium text-foreground">{label(admin)}</span>
                  {admin.isOwner && (
                    <span className="ml-2 rounded bg-secondary px-1.5 py-0.5 text-[10px] font-semibold uppercase text-muted">
                      Owner
                    </span>
                  )}
                  {admin.id === currentAdminId && (
                    <span className="ml-2 text-xs text-muted">(you)</span>
                  )}
                </td>
                <td className={CELL}>
                  <span className={admin.isActive ? "text-success" : "text-muted"}>
                    {admin.isActive ? "Active" : "Deactivated"}
                  </span>
                </td>
                <td className={`${CELL} text-muted`}>
                  {admin.lastLoginAt
                    ? new Date(admin.lastLoginAt).toLocaleDateString()
                    : "Never"}
                </td>
                <td className={`${CELL} text-right`}>
                  {/* The owner row carries no control. The route refuses it too. */}
                  {admin.isOwner ? (
                    <span className="text-xs text-muted">—</span>
                  ) : (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => toggleActive(admin)}
                      className="rounded-lg border border-border-strong px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-secondary disabled:opacity-60"
                    >
                      {admin.isActive ? "Deactivate" : "Reactivate"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
