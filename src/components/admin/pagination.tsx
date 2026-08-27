import Link from "next/link";
import { LuChevronLeft, LuChevronRight } from "react-icons/lu";
import { cn } from "@/lib/utils";

export type PageWindow = {
  /** Clamped into [1, totalPages]. */
  page: number;
  totalPages: number;
  /** One-indexed range of rows shown; 0/0 when there are none. */
  from: number;
  to: number;
  hasPrev: boolean;
  hasNext: boolean;
};

/**
 * Pure page arithmetic.
 *
 * Clamps rather than trusts: `?page=` is one hand-edited URL away, and an
 * out-of-range page must not render an empty table with a live Next button.
 * An empty result set reports one page, not zero, so "Page 1 of 0" never
 * renders.
 */
export function pageWindow({
  page,
  pageSize,
  total,
}: {
  page: number;
  pageSize: number;
  total: number;
}): PageWindow {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const clamped = Math.min(Math.max(1, Math.floor(page)), totalPages);

  return {
    page: clamped,
    totalPages,
    from: total === 0 ? 0 : (clamped - 1) * pageSize + 1,
    to: total === 0 ? 0 : Math.min(clamped * pageSize, total),
    hasPrev: clamped > 1,
    hasNext: clamped < totalPages,
  };
}

const LINK_CLS =
  "inline-flex items-center gap-1 rounded-lg border border-border-strong bg-card px-3 py-1.5 text-sm font-semibold text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60";

function hrefFor(
  basePath: string,
  params: Record<string, string>,
  page: number,
): string {
  const next = new URLSearchParams(params);
  // Page 1 is the default, so it stays out of the URL and the canonical link
  // for a filter does not depend on how the user arrived at it.
  if (page > 1) next.set("page", String(page));
  else next.delete("page");
  const query = next.toString();
  return query ? `${basePath}?${query}` : basePath;
}

export function Pagination({
  window: win,
  basePath,
  params,
  className,
}: {
  window: PageWindow;
  basePath: string;
  /** Current filters, preserved across page changes. */
  params: Record<string, string>;
  className?: string;
}) {
  if (win.totalPages <= 1) return null;

  return (
    <nav
      aria-label="Pagination"
      className={cn("mt-4 flex items-center justify-between gap-3", className)}
    >
      <p className="text-sm text-muted">
        Showing{" "}
        <span className="tabular-nums text-foreground">
          {win.from}–{win.to}
        </span>{" "}
        · page{" "}
        <span className="tabular-nums text-foreground">{win.page}</span> of{" "}
        <span className="tabular-nums text-foreground">{win.totalPages}</span>
      </p>

      <div className="flex gap-2">
        {win.hasPrev ? (
          <Link href={hrefFor(basePath, params, win.page - 1)} className={LINK_CLS}>
            <LuChevronLeft className="h-4 w-4" /> Previous
          </Link>
        ) : (
          <span className={cn(LINK_CLS, "cursor-not-allowed opacity-50")} aria-disabled>
            <LuChevronLeft className="h-4 w-4" /> Previous
          </span>
        )}
        {win.hasNext ? (
          <Link href={hrefFor(basePath, params, win.page + 1)} className={LINK_CLS}>
            Next <LuChevronRight className="h-4 w-4" />
          </Link>
        ) : (
          <span className={cn(LINK_CLS, "cursor-not-allowed opacity-50")} aria-disabled>
            Next <LuChevronRight className="h-4 w-4" />
          </span>
        )}
      </div>
    </nav>
  );
}
