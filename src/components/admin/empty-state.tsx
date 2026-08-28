import { cn } from "@/lib/utils";

/**
 * One empty state for the console.
 *
 * "Choose a subject", "no questions yet" and "no students match" were three
 * different treatments of the same moment.
 */
export function EmptyState({
  title,
  message,
  action,
  variant = "dashed",
  className,
}: {
  title: string;
  message?: string;
  action?: React.ReactNode;
  variant?: "dashed" | "plain";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-lg px-4 py-10 text-center",
        variant === "dashed"
          ? "border border-dashed border-border-strong bg-card"
          : "",
        className,
      )}
    >
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {message && (
        <p className="mx-auto mt-1.5 max-w-md text-sm text-muted">{message}</p>
      )}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
