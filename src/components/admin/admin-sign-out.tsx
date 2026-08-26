"use client";

import { LuLogOut } from "react-icons/lu";

// Signs out of the admin session only. The student cookie has a different name
// and a different scope, so a student session in another tab survives this.
// Must be rendered inside AdminSessionProvider.
export function AdminSignOut() {
  async function handleSignOut() {
    const { signOut } = await import("next-auth/react");
    await signOut({ callbackUrl: "/admin/login" });
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      className="flex w-full items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-muted hover:text-foreground transition-colors"
    >
      <LuLogOut className="w-3.5 h-3.5" />
      Sign out
    </button>
  );
}
