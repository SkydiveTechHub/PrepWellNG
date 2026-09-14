"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { buttonClass } from "@/components/ui/button";
import { FormMessage } from "./section";

export type DeviceRow = {
  id: string;
  label: string;
  lastActive: string;
  isCurrent: boolean;
};

export function DeviceList({ devices }: { devices: DeviceRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function signOut(body: { deviceId: string } | { allOthers: true }, key: string) {
    setBusy(key);
    setError("");
    try {
      const res = await fetch("/api/user/devices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Could not sign out that device.");
        return;
      }
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  const others = devices.filter((d) => !d.isCurrent);

  return (
    <div>
      <FormMessage error={error} />

      <ul className="divide-y divide-border">
        {devices.map((device) => (
          <li key={device.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div>
              <p className="text-sm font-semibold text-foreground">
                {device.label}
                {device.isCurrent && (
                  <span className="ml-2 rounded-full bg-success-soft px-2 py-0.5 text-xs font-semibold text-success">
                    This device
                  </span>
                )}
              </p>
              <p className="text-xs text-muted">{device.lastActive}</p>
            </div>
            {!device.isCurrent && (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => signOut({ deviceId: device.id }, device.id)}
                className={buttonClass("outline", "sm")}
              >
                {busy === device.id ? "Signing out…" : "Sign out"}
              </button>
            )}
          </li>
        ))}
      </ul>

      {others.length > 1 && (
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => signOut({ allOthers: true }, "all")}
          className={`mt-4 ${buttonClass("outline", "md")}`}
        >
          {busy === "all" ? "Signing out…" : "Sign out all other devices"}
        </button>
      )}
    </div>
  );
}
