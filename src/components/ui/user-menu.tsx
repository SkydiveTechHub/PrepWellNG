"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { LuSettings, LuLogOut, LuChevronDown } from "react-icons/lu";
import { Avatar } from "./avatar";
import { cn } from "@/lib/utils";
import { useExamActive } from "@/components/assessment/exam-active";

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
  const examActive = useExamActive();
  /**
   * Sign out is a button, so the exam's link guard never sees it. Rather than
   * reach a modal across the tree, mid-exam it simply asks twice — enough that
   * a mistap can't end a paper, and nothing at all in the way otherwise.
   */
  const [armedSignOut, setArmedSignOut] = useState(false);
  /** Derived, so finishing the exam drops the second step on its own. */
  const confirmingSignOut = armedSignOut && examActive;

  const closeMenu = useCallback(() => {
    setOpen(false);
    setArmedSignOut(false);
  }, []);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) closeMenu();
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeMenu();
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, closeMenu]);

  async function handleSignOut() {
    if (examActive && !confirmingSignOut) {
      setArmedSignOut(true);
      return;
    }
    const { signOut } = await import("next-auth/react");
    signOut({ callbackUrl: "/login" });
  }

  const name = [user.firstName, user.lastName].filter(Boolean).join(" ");
  const detail = subtitle(user);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => (open ? closeMenu() : setOpen(true))}
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
            prefetch={examActive ? false : undefined}
            onClick={closeMenu}
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
            <LuLogOut className="w-4 h-4 flex-shrink-0" />
            {confirmingSignOut ? "Sign out mid-exam?" : "Sign out"}
          </button>
          {confirmingSignOut && (
            <p className="px-3 pb-2 text-xs leading-relaxed text-muted">
              Your answers are saved — tap again to sign out, or close this menu
              to keep going.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
