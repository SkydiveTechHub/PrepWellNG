import { cn } from "@/lib/utils";

/**
 * The admin's table chrome, in one place.
 *
 * Overview, Lessons and Questions each declared their own copy of this class
 * and their own border treatment, so a change to one silently diverged from
 * the others.
 */
export const TH_CLS =
  "text-[11px] font-semibold uppercase tracking-wider text-muted";

export function AdminTable({
  caption,
  children,
  className,
}: {
  /** Screen-reader description of what the table lists. Required. */
  caption: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-x-auto rounded-lg border border-border-strong bg-card",
        className,
      )}
    >
      <table className="w-full text-sm">
        <caption className="sr-only">{caption}</caption>
        {children}
      </table>
    </div>
  );
}

/**
 * Low-priority columns drop out on narrow screens rather than forcing the
 * table to scroll sideways. Pass the same class to the column's AdminTh and
 * every AdminTd, and fold the hidden value into a visible cell below that
 * breakpoint so nothing is lost.
 */
export const HIDE_BELOW = {
  sm: "hidden sm:table-cell",
  md: "hidden md:table-cell",
  lg: "hidden lg:table-cell",
} as const;

/** Shown only while the matching HIDE_BELOW column is hidden. */
export const SHOW_BELOW = {
  sm: "sm:hidden",
  md: "md:hidden",
  lg: "lg:hidden",
} as const;

const CELL_PAD = "px-3 py-2.5 sm:px-4";

export function AdminTh({
  children,
  align = "left",
  scope = "col",
  className,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  scope?: "col" | "row";
  className?: string;
}) {
  return (
    <th
      scope={scope}
      className={cn(
        CELL_PAD,
        align === "right" ? "text-right" : "text-left",
        TH_CLS,
        className,
      )}
    >
      {children}
    </th>
  );
}

export function AdminTr({ children }: { children: React.ReactNode }) {
  return (
    <tr className="border-b border-border-strong last:border-0">{children}</tr>
  );
}

export function AdminTd({
  children,
  align = "left",
  className,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <td
      className={cn(
        CELL_PAD,
        align === "right" ? "text-right" : "text-left",
        className,
      )}
    >
      {children}
    </td>
  );
}
