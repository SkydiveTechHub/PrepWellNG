"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/performance", label: "Overview" },
  { href: "/performance/subjects", label: "By subject" },
];

/**
 * A scrollable pill rail, not a desktop tab bar: at 360px a wrapping tab bar
 * breaks into two ragged lines and the active tab moves under the thumb.
 */
export function PerformanceTabs() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Performance views"
      className="-mx-4 mb-6 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <ul className="flex w-max gap-2">
        {TABS.map((tab) => {
          const active =
            tab.href === "/performance"
              ? pathname === "/performance"
              : pathname.startsWith(tab.href);
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`block whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                  active
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-muted hover:text-foreground"
                }`}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
