"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { LuMenu, LuX, LuCalendarDays } from "react-icons/lu";
import { UserMenu, type ProfileUser } from "./user-menu";
import {
  NAV_GROUPS,
  SETTINGS_ITEM,
  BRAND,
  EXAM_TARGET,
  daysUntil,
} from "@/lib/navigation";
import { cn } from "@/lib/utils";

export function MobileHeader({ user }: { user: ProfileUser }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  function isActive(href: string) {
    return pathname === href || (href !== "/" && pathname.startsWith(href));
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-card/90 backdrop-blur-md lg:hidden">
      <div className="flex h-14 items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-foreground transition-colors hover:bg-secondary"
          >
            <LuMenu className="h-5 w-5" />
          </button>
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-brand">
              <BRAND.icon className="h-4 w-4 text-white" />
            </div>
            <span className="text-base font-bold tracking-tight text-foreground">
              {BRAND.name}
            </span>
          </Link>
        </div>

        <UserMenu user={user} align="right" />
      </div>

      {/* Drawer */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/50 animate-fade-in"
            onClick={() => setOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 flex w-[280px] max-w-[85vw] flex-col bg-card shadow-lift animate-slide-up">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-brand">
                  <BRAND.icon className="h-4.5 w-4.5 text-white" />
                </div>
                <span className="text-base font-bold tracking-tight text-foreground">
                  {BRAND.name}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-secondary hover:text-foreground"
              >
                <LuX className="h-5 w-5" />
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto px-3 py-4">
              {NAV_GROUPS.map((group) => (
                <div key={group.label} className="mb-5">
                  <p className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-widest text-muted/70">
                    {group.label}
                  </p>
                  <div className="space-y-0.5">
                    {group.items.map((item) => {
                      const active = isActive(item.href);
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setOpen(false)}
                          aria-current={active ? "page" : undefined}
                          className={cn(
                            "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors",
                            active
                              ? "bg-primary-soft text-primary-soft-foreground"
                              : "text-muted hover:bg-secondary hover:text-foreground",
                          )}
                        >
                          <item.icon
                            className={cn(
                              "h-[18px] w-[18px] flex-shrink-0",
                              active ? "text-primary" : "text-muted/70",
                            )}
                          />
                          {item.name}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
              <Link
                href={SETTINGS_ITEM.href}
                onClick={() => setOpen(false)}
                aria-current={isActive(SETTINGS_ITEM.href) ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors",
                  isActive(SETTINGS_ITEM.href)
                    ? "bg-primary-soft text-primary-soft-foreground"
                    : "text-muted hover:bg-secondary hover:text-foreground",
                )}
              >
                <SETTINGS_ITEM.icon className="h-[18px] w-[18px] text-muted/70" />
                {SETTINGS_ITEM.name}
              </Link>
            </nav>

            <div className="border-t border-border p-4">
              <div className="flex items-center justify-between rounded-xl bg-secondary px-4 py-3">
                <div className="flex items-center gap-2">
                  <LuCalendarDays className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold text-foreground">
                    {EXAM_TARGET.label}
                  </span>
                </div>
                <span className="text-sm font-bold text-primary">
                  {daysUntil(EXAM_TARGET.date)} days
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
