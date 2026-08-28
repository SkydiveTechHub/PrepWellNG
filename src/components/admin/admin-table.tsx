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

export function AdminTh({
  children,
  align = "left",
  scope = "col",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  scope?: "col" | "row";
}) {
  return (
    <th
      scope={scope}
      className={cn(
        "px-4 py-2.5",
        align === "right" ? "text-right" : "text-left",
        TH_CLS,
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
        "px-4 py-2.5",
        align === "right" ? "text-right" : "text-left",
        className,
      )}
    >
      {children}
    </td>
  );
}
