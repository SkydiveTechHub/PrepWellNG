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
} from "react-icons/lu";

// Keep the bottom bar to five destinations — research-backed max for
// thumb-reach. Everything else lives in the header drawer.
const tabs = [
  { name: "Home", href: "/dashboard", icon: LuHouse },
  { name: "Classroom", href: "/classroom", icon: LuBookOpen },
  { name: "Practice", href: "/practice", icon: LuClipboardCheck },
  { name: "Stats", href: "/performance", icon: LuChartBar },
  { name: "Plan", href: "/study-plan", icon: LuCalendar },
];

// Routes that own the bottom edge of the screen. Stacking the exam action bar
// on top of this one cost ~130px of viewport on the smallest phones.
const IMMERSIVE_ROUTES = [
  /^\/practice\/mock-exam\/session/,
  /^\/practice\/past-questions\/[^/]+$/,
  /^\/practice\/cbt/,
  /^\/classroom\/[^/]+\/[^/]+\/quiz/,
  /^\/classroom\/[^/]+\/[^/]+\/lessons\/[^/]+\/practice$/,
];

export function MobileNav() {
  const pathname = usePathname();

  if (IMMERSIVE_ROUTES.some((route) => route.test(pathname))) return null;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card/95 backdrop-blur-md lg:hidden">
      <div className="mx-auto flex max-w-lg items-stretch justify-around">
        {tabs.map((tab) => {
          const isActive =
            pathname === tab.href ||
            (tab.href !== "/" && pathname.startsWith(tab.href));

          return (
            <Link
              key={tab.name}
              href={tab.href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "relative flex flex-1 flex-col items-center gap-1 px-2 py-2 text-[11px] font-semibold transition-colors",
                isActive ? "text-primary" : "text-muted hover:text-foreground",
              )}
            >
              {isActive && (
                <span className="absolute top-0 h-0.5 w-8 rounded-full bg-primary" />
              )}
              <tab.icon className="h-5 w-5" />
              {tab.name}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
