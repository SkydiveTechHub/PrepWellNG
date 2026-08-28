"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LuEllipsis, LuX } from "react-icons/lu";
import { cn } from "@/lib/utils";
import { moreSheetGroups } from "@/lib/admin-nav";

const LABEL_CLS = "text-[11px] font-semibold uppercase tracking-wider text-muted";

export function AdminNavMore({ isOwner }: { isOwner: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const groups = moreSheetGroups(isOwner);

  // A route change must close the sheet, or it covers the page just opened.
  // Adjusted during render (React's documented pattern for state that must
  // change alongside a prop) rather than in an effect, which would fire a
  // setState after the paint the route change already caused.
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const containsCurrent = groups.some((group) =>
    group.items.some((item) => item.href === pathname),
  );

  if (groups.length === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={cn(
          "flex flex-col items-center gap-0.5 rounded-lg px-3 py-1 text-xs font-semibold transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
          containsCurrent ? "text-primary" : "text-muted",
        )}
      >
        <LuEllipsis className="h-5 w-5" />
        More
      </button>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/50"
          />
          <div
            role="dialog"
            aria-label="More admin sections"
            className="absolute inset-x-0 bottom-0 max-h-[70vh] overflow-y-auto rounded-t-2xl border-t border-border bg-card p-4 pb-8"
          >
            <div className="mb-3 flex items-center justify-between">
              <span className={LABEL_CLS}>More</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="rounded-lg p-1.5 text-muted hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
              >
                <LuX className="h-5 w-5" />
              </button>
            </div>

            <div className="flex flex-col gap-4">
              {groups.map((group) => (
                <div key={group.label}>
                  <p className={LABEL_CLS}>{group.label}</p>
                  <div className="mt-1.5 space-y-0.5">
                    {group.items.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        aria-current={item.href === pathname ? "page" : undefined}
                        className={cn(
                          "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
                          item.href === pathname
                            ? "bg-secondary text-foreground"
                            : "text-muted hover:bg-secondary hover:text-foreground",
                        )}
                      >
                        <item.icon className="h-4 w-4 flex-shrink-0" />
                        {item.name}
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
