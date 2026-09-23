"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { UserMenu, type ProfileUser } from "./user-menu";
import { NAV_GROUPS, SETTINGS_ITEM } from "@/lib/navigation";
import { Logo } from "@/components/ui/logo";
import { useExamActive } from "@/components/assessment/exam-active";

export function Sidebar({
  user,
  countdown,
}: {
  user: ProfileUser;
  /**
   * The exam countdown card, rendered on the server and streamed in — it needs
   * the student's study plan, which this shell must not wait on. Absent when no
   * plan is counting down to a sitting.
   */
  countdown?: React.ReactNode;
}) {
  const pathname = usePathname();

  function isActive(href: string) {
    return pathname === href || (href !== "/" && pathname.startsWith(href));
  }

  // Mid-exam every one of these sits behind a "leave this exam?" prompt, so
  // prefetching them spends the student's data on a route we are talking them
  // out of. Undefined rather than true off-exam, to keep Next's own default.
  const prefetch = useExamActive() ? false : undefined;

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-border bg-card lg:flex">
      {/* Brand */}
      <Logo
        href="/dashboard"
        prefetch={prefetch}
        className="border-b border-border px-2 py-1"
        imageClassName="h-20"
      />

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="mb-5">
            <p className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-widest text-muted">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    prefetch={prefetch}
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
                          : "text-muted group-hover:text-foreground",
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
          prefetch={prefetch}
          aria-current={isActive(SETTINGS_ITEM.href) ? "page" : undefined}
          className={cn(
            "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors",
            isActive(SETTINGS_ITEM.href)
              ? "bg-primary-soft text-primary-soft-foreground"
              : "text-muted hover:bg-secondary hover:text-foreground",
          )}
        >
          <SETTINGS_ITEM.icon className="h-[18px] w-[18px] text-muted group-hover:text-foreground" />
          {SETTINGS_ITEM.name}
        </Link>
      </nav>

      {/* Account + countdown */}
      <div className="border-t border-border px-2 pt-2">
        <UserMenu user={user} showDetails />
      </div>
      {countdown}
    </aside>
  );
}
