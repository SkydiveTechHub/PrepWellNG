"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { ADMIN_NAV } from "@/lib/admin-nav";

export function AdminNav({ variant }: { variant: "sidebar" | "mobile" }) {
  const pathname = usePathname();

  // Exact match only. Prefix matching would light "Questions" while the user
  // is on "Questions › Import", and "Overview" on every admin page.
  const isActive = (href: string) => pathname === href;

  if (variant === "mobile") {
    return (
      <nav
        aria-label="Admin"
        className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card lg:hidden"
      >
        <div className="flex items-center justify-around py-2">
          {ADMIN_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item.href) ? "page" : undefined}
              className={cn(
                "flex flex-col items-center gap-0.5 rounded-lg px-3 py-1 text-xs font-semibold transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
                isActive(item.href) ? "text-primary" : "text-muted",
              )}
            >
              <item.icon className="h-5 w-5" />
              {item.name}
            </Link>
          ))}
        </div>
      </nav>
    );
  }

  return (
    <nav aria-label="Admin" className="space-y-0.5 p-3">
      {ADMIN_NAV.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={isActive(item.href) ? "page" : undefined}
          className={cn(
            "relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
            isActive(item.href)
              ? "bg-secondary text-foreground"
              : "text-muted hover:bg-secondary hover:text-foreground",
          )}
        >
          {isActive(item.href) && (
            // A left rule rather than the student app's soft pill — the admin
            // reads as an instrument panel.
            <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r bg-primary" />
          )}
          <item.icon className="h-4 w-4 flex-shrink-0" />
          {item.name}
        </Link>
      ))}
    </nav>
  );
}
