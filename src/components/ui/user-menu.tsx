"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { LuSettings, LuLogOut, LuChevronDown } from "react-icons/lu";
import { Avatar } from "./avatar";
import { cn } from "@/lib/utils";

export type ProfileUser = {
  firstName?: string | null;
  lastName?: string | null;
  image?: string | null;
  classLevel?: string | null;
  track?: string | null;
};

const TRACK_LABELS: Record<string, string> = {
  SCIENCE: "Science",
  ARTS: "Arts",
  COMMERCIAL: "Commercial",
};

/** "SS2 · Science", or whichever half is set, or nothing. */
function subtitle(user: ProfileUser) {
  return [user.classLevel, user.track ? TRACK_LABELS[user.track] : null]
    .filter(Boolean)
    .join(" · ");
}

export function UserMenu({
  user,
  align = "left",
  showDetails = false,
}: {
  user: ProfileUser;
  /** Which edge the dropdown hangs from. */
  align?: "left" | "right";
  /** Sidebar shows name and class alongside the avatar; mobile shows only the avatar. */
  showDetails?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function handleSignOut() {
    const { signOut } = await import("next-auth/react");
    signOut({ callbackUrl: "/login" });
  }

  const name = [user.firstName, user.lastName].filter(Boolean).join(" ");
  const detail = subtitle(user);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className={cn(
          "flex items-center gap-2.5 rounded-lg transition-colors",
          showDetails
            ? "w-full px-2 py-2 hover:bg-secondary text-left"
            : "p-0.5 hover:bg-secondary",
        )}
      >
        <Avatar
          image={user.image}
          firstName={user.firstName}
          lastName={user.lastName}
          className={showDetails ? "w-9 h-9" : "w-8 h-8"}
        />

        {showDetails && (
          <>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-medium text-foreground truncate">
                {name || "Your account"}
              </span>
              {detail && (
                <span className="block text-xs text-muted truncate">
                  {detail}
                </span>
              )}
            </span>
            <LuChevronDown
              className={cn(
                "w-4 h-4 text-muted flex-shrink-0 transition-transform",
                open && "rotate-180",
              )}
            />
          </>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className={cn(
            "absolute z-50 min-w-52 rounded-lg border border-border bg-card shadow-lg py-1",
            // Sidebar sits at the bottom of the screen, so its menu opens
            // upward; the mobile header's opens downward.
            showDetails ? "bottom-full mb-2" : "top-full mt-2",
            align === "right" ? "right-0" : "left-0",
          )}
        >
          {!showDetails && (
            <div className="px-3 py-2 border-b border-border">
              <p className="text-sm font-medium text-foreground truncate">
                {name || "Your account"}
              </p>
              {detail && <p className="text-xs text-muted truncate">{detail}</p>}
            </div>
          )}

          <Link
            href="/settings"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-3 py-2 text-sm text-foreground hover:bg-secondary transition-colors"
          >
            <LuSettings className="w-4 h-4 text-muted" />
            Settings
          </Link>

          <button
            type="button"
            role="menuitem"
            onClick={handleSignOut}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-danger hover:bg-secondary transition-colors"
          >
            <LuLogOut className="w-4 h-4" />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
