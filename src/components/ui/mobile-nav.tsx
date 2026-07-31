"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LuHouse,
  LuBookOpen,
  LuClipboardCheck,
  LuChartBar,
  LuCalendar,
  LuAward,
  LuBook,
} from "react-icons/lu";

const tabs = [
  { name: "Home", href: "/", icon: LuHouse },
  { name: "Library", href: "/library", icon: LuBook },
  { name: "Subjects", href: "/subjects", icon: LuBookOpen },
  { name: "Practice", href: "/practice", icon: LuClipboardCheck },
  { name: "Stats", href: "/performance", icon: LuChartBar },
  { name: "Awards", href: "/achievements", icon: LuAward },
  { name: "Plan", href: "/study-plan", icon: LuCalendar },
];

export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="lg:hidden fixed bottom-0 inset-x-0 bg-card border-t border-border z-50">
      <div className="flex items-center justify-around py-2">
        {tabs.map((tab) => {
          const isActive =
            pathname === tab.href ||
            (tab.href !== "/" && pathname.startsWith(tab.href));

          return (
            <Link
              key={tab.name}
              href={tab.href}
              className={cn(
                "flex flex-col items-center gap-0.5 px-3 py-1 text-xs font-medium transition-colors",
                isActive ? "text-primary" : "text-muted"
              )}
            >
              <tab.icon className="w-5 h-5" />
              {tab.name}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
