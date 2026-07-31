"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { UserMenu, type ProfileUser } from "./user-menu";
import {
  LuHouse,
  LuBookOpen,
  LuClipboardCheck,
  LuChartBar,
  LuCalendar,
  LuSettings,
  LuGraduationCap,
  LuAward,
  LuBook,
} from "react-icons/lu";

const navigation = [
  { name: "Dashboard", href: "/", icon: LuHouse },
  { name: "Library", href: "/library", icon: LuBook },
  { name: "Subjects", href: "/subjects", icon: LuBookOpen },
  { name: "Practice", href: "/practice", icon: LuClipboardCheck },
  { name: "Performance", href: "/performance", icon: LuChartBar },
  { name: "Achievements", href: "/achievements", icon: LuAward },
  { name: "Study Plan", href: "/study-plan", icon: LuCalendar },
  { name: "Settings", href: "/settings", icon: LuSettings },
];

export function Sidebar({ user }: { user: ProfileUser }) {
  const pathname = usePathname();

  return (
    <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 border-r border-border bg-card">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-6 py-5 border-b border-border">
        <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
          <LuGraduationCap className="w-5 h-5 text-primary-foreground" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-foreground tracking-tight">
            PrepWell
          </h1>
          <p className="text-[11px] text-muted -mt-0.5 uppercase tracking-wider">
            Nigeria
          </p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navigation.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/" && pathname.startsWith(item.href));

          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted hover:bg-secondary hover:text-foreground"
              )}
            >
              <item.icon className="w-5 h-5 flex-shrink-0" />
              {item.name}
            </Link>
          );
        })}
      </nav>

      {/* Account */}
      <div className="px-2 py-2 border-t border-border">
        <UserMenu user={user} showDetails />
      </div>

      {/* Exam Countdown */}
      <div className="px-4 py-4 border-t border-border">
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
          <p className="text-xs font-medium text-amber-800">WAEC 2027</p>
          <p className="text-lg font-bold text-amber-900 mt-0.5">--- days</p>
          <p className="text-xs text-amber-700">Keep preparing!</p>
        </div>
      </div>
    </aside>
  );
}
