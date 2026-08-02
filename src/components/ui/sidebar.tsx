"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { UserMenu, type ProfileUser } from "./user-menu";
import {
  NAV_GROUPS,
  SETTINGS_ITEM,
  BRAND,
  EXAM_TARGET,
  daysUntil,
} from "@/lib/navigation";
import { LuCalendarDays } from "react-icons/lu";

export function Sidebar({ user }: { user: ProfileUser }) {
  const pathname = usePathname();

  function isActive(href: string) {
    return pathname === href || (href !== "/" && pathname.startsWith(href));
  }

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-border bg-card lg:flex">
      {/* Brand */}
      <Link
        href="/dashboard"
        className="flex items-center gap-2.5 border-b border-border px-6 py-5"
      >
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-brand shadow-soft">
          <BRAND.icon className="h-5 w-5 text-white" />
        </div>
        <div>
          <p className="text-lg font-bold leading-tight tracking-tight text-foreground">
            {BRAND.name}
          </p>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted">
            {BRAND.tagline}
          </p>
        </div>
      </Link>

      {/* Navigation */}
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
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors",
                      active
                        ? "bg-primary-soft text-primary-soft-foreground"
                        : "text-muted hover:bg-secondary hover:text-foreground",
                    )}
                  >
                    {active && (
                      <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-primary" />
                    )}
                    <item.icon
                      className={cn(
                        "h-[18px] w-[18px] flex-shrink-0",
                        active
                          ? "text-primary"
                          : "text-muted/70 group-hover:text-foreground",
                      )}
                    />
                    {item.name}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}

        {/* Settings */}
        <Link
          href={SETTINGS_ITEM.href}
          aria-current={isActive(SETTINGS_ITEM.href) ? "page" : undefined}
          className={cn(
            "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors",
            isActive(SETTINGS_ITEM.href)
              ? "bg-primary-soft text-primary-soft-foreground"
              : "text-muted hover:bg-secondary hover:text-foreground",
          )}
        >
          <SETTINGS_ITEM.icon className="h-[18px] w-[18px] text-muted/70 group-hover:text-foreground" />
          {SETTINGS_ITEM.name}
        </Link>
      </nav>

      {/* Account + countdown */}
      <div className="border-t border-border px-2 pt-2">
        <UserMenu user={user} showDetails />
      </div>
      <div className="px-4 py-4">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary to-brand p-4 shadow-lift">
          <div className="absolute -right-4 -top-6 h-20 w-20 rounded-full bg-white/10" />
          <div className="absolute -bottom-8 -left-4 h-20 w-20 rounded-full bg-white/10" />
          <div className="relative">
            <div className="flex items-center gap-1.5">
              <LuCalendarDays className="h-3.5 w-3.5 text-white/80" />
              <p className="text-[11px] font-bold uppercase tracking-wider text-white/80">
                {EXAM_TARGET.label}
              </p>
            </div>
            <p className="mt-1 text-2xl font-bold text-white">
              {daysUntil(EXAM_TARGET.date)}
              <span className="ml-1 text-sm font-semibold text-white/80">
                days
              </span>
            </p>
            <p className="text-xs text-white/80">
              Every question today counts. Keep going!
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}
